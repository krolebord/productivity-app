import type { StepContext } from "@cloudflare/think";
import { conversationTurnFilesData, conversationTurnFilesFromData } from "@productivity/core/agent/conversation-files";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  conversationTitleFromTurnText,
  projectionRowsFromStep,
  projectionRowsFromUiMessages,
  textProjectionId,
  toolProjectionId,
  userTurnModelText,
} from "./conversation-projection";

describe("conversationTitleFromTurnText", () => {
  it("uses the user prose when present", () => {
    expect(conversationTitleFromTurnText("  Summarize my notes  ")).toBe("Summarize my notes");
  });

  it("prefers filenames over the workspace-suffix prose", () => {
    expect(
      conversationTitleFromTurnText(
        [
          "Uploaded files are available in the agent workspace:",
          "- report.csv: /uploads/01-report.csv (text/csv, 12 bytes)",
          "- notes.md: /uploads/02-notes.md (text/markdown, 8 bytes)",
        ].join("\n"),
      ),
    ).toBe("report.csv, notes.md");
  });

  it("strips the workspace suffix from a mixed send", () => {
    expect(
      conversationTitleFromTurnText(
        [
          "Please chart this",
          "",
          "Uploaded files are available in the agent workspace:",
          "- data.csv: /uploads/01-data.csv (text/csv, 4 bytes)",
        ].join("\n"),
      ),
    ).toBe("Please chart this");
  });

  it("uses provided filenames when the prompt is empty", () => {
    expect(conversationTitleFromTurnText("", ["report.csv", "notes.md"])).toBe("report.csv, notes.md");
  });
});

describe("userTurnModelText", () => {
  it("keeps the prompt and appends workspace paths for the model", () => {
    expect(
      userTurnModelText("Chart this", [
        { filename: "data.csv", mediaType: "text/csv", size: 4, path: "/uploads/t1/00-data.csv" },
      ]),
    ).toBe(
      [
        "Chart this",
        "",
        "Uploaded files are available in the agent workspace:",
        "- data.csv: /uploads/t1/00-data.csv (text/csv, 4 bytes)",
      ].join("\n"),
    );
  });

  it("is only the workspace listing when the prompt is empty", () => {
    expect(
      userTurnModelText("  ", [
        { filename: "report.csv", mediaType: "text/csv", size: 12, path: "/uploads/t1/00-report.csv" },
      ]),
    ).toBe(
      [
        "Uploaded files are available in the agent workspace:",
        "- report.csv: /uploads/t1/00-report.csv (text/csv, 12 bytes)",
      ].join("\n"),
    );
  });
});

describe("conversationTurnFilesFromData", () => {
  const file = { filename: "data.csv", mediaType: "text/csv", size: 4, path: "/uploads/t1/00-data.csv" };

  it("round-trips stored attachment metadata", () => {
    expect(conversationTurnFilesFromData(conversationTurnFilesData([file]))).toEqual([file]);
    expect(conversationTurnFilesFromData("")).toEqual([]);
    expect(conversationTurnFilesFromData("{")).toEqual([]);
  });
});

type StepContent = StepContext["content"];

function toolStep(input: {
  toolCallId?: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: unknown;
}): StepContent {
  const call = { toolCallId: input.toolCallId ?? "c", toolName: input.toolName, input: input.input, dynamic: true };
  return [
    { type: "tool-call", ...call },
    input.error === undefined
      ? { type: "tool-result", ...call, output: input.output }
      : { type: "tool-error", ...call, error: input.error },
  ];
}

describe("projectionRowsFromUiMessages", () => {
  it("projects user text, tools, and assistant text in message order", () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Chart spend" }],
      },
      {
        id: "asst-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "dynamic-tool",
            toolCallId: "call-1",
            toolName: "renderChart",
            state: "output-available",
            input: { type: "bar", data: [{ x: "a", y: 1 }], xKey: "x", series: [{ key: "y" }] },
            output: { rendered: true },
          },
          { type: "reasoning", text: "thinking" },
          { type: "text", text: "Here is the chart." },
        ],
      },
    ];

    const rows = projectionRowsFromUiMessages({
      conversationId: "c1",
      messages,
      createdAt: 1,
    });

    expect(rows.map((row) => ({ id: row.id, seq: row.seq, kind: row.kind, toolState: row.toolState }))).toEqual([
      { id: "user-1", seq: 1, kind: "text", toolState: "" },
      { id: toolProjectionId("asst-1", "call-1"), seq: 2, kind: "tool", toolState: "done" },
      { id: textProjectionId("asst-1", 0, 0), seq: 3, kind: "text", toolState: "" },
    ]);
    expect(rows[1]?.data).toContain('"type":"bar"');
    expect(rows[2]?.text).toBe("Here is the chart.");
  });
});

describe("projectionRowsFromStep", () => {
  const step = (stepNumber: number, startSeq: number, content: StepContent) =>
    projectionRowsFromStep({
      conversationId: "c1",
      sessionMessageId: "asst-1",
      stepNumber,
      startSeq,
      createdAt: 1,
      content,
    });

  it("keeps tool outcomes from the step, even before the streamed message has them", () => {
    const file = { filename: "report.csv", mediaType: "text/csv", size: 12, path: "/downloads/01-report.csv" };
    const rows = step(0, 1, [
      { type: "text", text: "Preparing your download." },
      ...toolStep({
        toolCallId: "call-download",
        toolName: "saveDownload",
        input: { path: "/report.csv" },
        output: file,
      }),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(["text", "tool"]);
    expect(rows[1]).toMatchObject({
      id: toolProjectionId("asst-1", "call-download"),
      seq: 2,
      toolState: "done",
      data: JSON.stringify(file),
    });
  });

  it("marks failed tools as errors", () => {
    const rows = step(
      0,
      1,
      toolStep({ toolName: "saveDownload", input: { path: "/missing.csv" }, error: "Not found" }),
    );
    expect(rows[0]?.toolState).toBe("error");
  });

  it("writes the same ids and order that a backfill of the final message produces", () => {
    const message: UIMessage = {
      id: "asst-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "text", text: "Deleting the empty conversations now." },
        {
          type: "dynamic-tool",
          toolCallId: "call-delete",
          toolName: "mutateDb",
          state: "output-available",
          input: { events: [] },
          output: { applied: true },
        },
        { type: "step-start" },
        { type: "text", text: "" },
        {
          type: "dynamic-tool",
          toolCallId: "call-verify",
          toolName: "queryDb",
          state: "output-available",
          input: { sql: "select 1" },
          output: { rows: [] },
        },
        { type: "text", text: "Nothing remains." },
      ],
    };

    const firstStep = step(0, 1, [
      { type: "text", text: "Deleting the empty conversations now." },
      ...toolStep({
        toolCallId: "call-delete",
        toolName: "mutateDb",
        input: { events: [] },
        output: { applied: true },
      }),
    ]);
    const secondStep = step(1, 3, [
      { type: "text", text: "" },
      ...toolStep({ toolCallId: "call-verify", toolName: "queryDb", input: { sql: "select 1" }, output: { rows: [] } }),
      { type: "text", text: "Nothing remains." },
    ]);
    const backfill = projectionRowsFromUiMessages({ conversationId: "c1", messages: [message], createdAt: 1 });

    expect([...firstStep, ...secondStep]).toEqual(backfill);
    expect(backfill.map((row) => row.id)).toEqual([
      textProjectionId("asst-1", 0, 0),
      toolProjectionId("asst-1", "call-delete"),
      toolProjectionId("asst-1", "call-verify"),
      textProjectionId("asst-1", 1, 1),
    ]);
  });

  it("gives each step its own text row even when the text repeats", () => {
    const first = step(0, 1, [{ type: "text", text: "Working on it." }]);
    const second = step(1, 2, [{ type: "text", text: "Working on it." }]);

    expect(first[0]?.id).not.toBe(second[0]?.id);
    expect([first[0]?.seq, second[0]?.seq]).toEqual([1, 2]);
  });

  it("targets the same row when a step is re-delivered, so the upsert overwrites", () => {
    const redelivered = (startSeq: number) => step(2, startSeq, [{ type: "text", text: "Retried." }])[0];

    expect(redelivered(9)?.id).toBe(redelivered(14)?.id);
  });

  function toolRowData(tool: Parameters<typeof toolStep>[0]): unknown {
    const [row] = step(0, 1, toolStep(tool));
    return row?.data ? JSON.parse(row.data) : row?.data;
  }

  it("keeps only the fields a chip draws, trimming web results", () => {
    expect(
      toolRowData({
        toolName: "web_search",
        input: { query: "eur rate", searchDepth: "basic" },
        output: {
          answer: "x".repeat(900),
          results: Array.from({ length: 12 }, (_, i) => ({
            title: `Result ${i}`,
            url: `https://example.com/${i}`,
            content: "y".repeat(5000),
            score: 0.9,
          })),
        },
      }),
    ).toEqual({
      query: "eur rate",
      answer: "x".repeat(600),
      results: Array.from({ length: 8 }, (_, i) => ({ title: `Result ${i}`, url: `https://example.com/${i}` })),
    });

    expect(
      toolRowData({
        toolName: "web_extract",
        input: { urls: ["https://a.test", "https://b.test"] },
        output: {
          results: [{ url: "https://a.test", rawContent: "z".repeat(9000) }],
          failedResults: [{ url: "https://b.test", error: "timeout" }],
        },
      }),
    ).toEqual({
      urlCount: 2,
      results: [{ url: "https://a.test" }],
      failedResults: [{ url: "https://b.test" }],
    });
  });

  it("projects memory, read, and skill payloads", () => {
    expect(toolRowData({ toolName: "remember", input: { content: "Prefers EUR" }, output: {} })).toEqual({
      content: "Prefers EUR",
    });

    expect(toolRowData({ toolName: "read_skill_resource", input: { path: "/skills/x/steps.md" }, output: {} })).toEqual(
      { path: "/skills/x/steps.md" },
    );

    expect(
      toolRowData({
        toolName: "create_skill",
        input: { name: "Monthly review", whenToUse: "...", instructions: "..." },
        output: { id: "skill-1", name: "Monthly review", status: "pending" },
      }),
    ).toEqual({ id: "skill-1", name: "Monthly review" });

    expect(toolRowData({ toolName: "create_skill", input: { name: "Monthly review" }, error: "failed" })).toEqual({
      id: null,
      name: "Monthly review",
    });
  });

  it("stores nothing for tools whose chip needs no payload", () => {
    expect(toolRowData({ toolName: "forget", input: { id: "m1" }, output: {} })).toBe("");
    expect(toolRowData({ toolName: "queryDb", input: { sql: "select 1" }, output: {} })).toBe("");
  });
});
