import type { StepContext } from "@cloudflare/think";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  conversationTitleFromTurnText,
  conversationTurnFilesData,
  conversationTurnFilesFromData,
  projectionRowsFromStep,
  projectionRowsFromUiMessages,
  type StepToolSnapshot,
  stepTextProjectionId,
  stepToolsFromContext,
  textProjectionId,
  toolProjectionId,
  uiMessageStepParts,
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

describe("projectionRowsFromUiMessages", () => {
  it("uses the id scheme for live writes and backfill", () => {
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
      { id: textProjectionId("asst-1", 3), seq: 3, kind: "text", toolState: "" },
    ]);
    expect(rows[1]?.data).toContain('"type":"bar"');
    expect(rows[2]?.text).toBe("Here is the chart.");
  });
});

describe("projectionRowsFromStep", () => {
  it("uses grouped step data when no ordered message parts are available", () => {
    const rows = projectionRowsFromStep({
      conversationId: "c1",
      sessionMessageId: "asst-2",
      stepNumber: 0,
      startSeq: 4,
      createdAt: 1,
      text: "Done.",
      tools: [
        {
          toolCallId: "call-9",
          toolName: "queryDb",
          input: { sql: "select 1" },
          output: { rows: [] },
          error: false,
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe(toolProjectionId("asst-2", "call-9"));
    expect(rows[0]?.seq).toBe(4);
    expect(rows[0]?.data).toBe("");
    expect(rows[1]?.id).toBe(stepTextProjectionId("asst-2", 0));
    expect(rows[1]?.seq).toBe(5);
  });

  it("preserves text and tool order from the streaming message", () => {
    const message: UIMessage = {
      id: "asst-ordered",
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

    const firstStep = projectionRowsFromStep({
      conversationId: "c1",
      sessionMessageId: message.id,
      stepNumber: 0,
      startSeq: 1,
      createdAt: 1,
      text: "",
      tools: [],
      orderedParts: uiMessageStepParts({ message, stepNumber: 0 }),
    });
    const secondStep = projectionRowsFromStep({
      conversationId: "c1",
      sessionMessageId: message.id,
      stepNumber: 1,
      startSeq: 3,
      createdAt: 1,
      text: "",
      tools: [],
      orderedParts: uiMessageStepParts({ message, stepNumber: 1 }),
    });

    expect(firstStep.map((row) => ({ id: row.id, kind: row.kind, text: row.text, toolName: row.toolName }))).toEqual([
      {
        id: textProjectionId("asst-ordered", 1),
        kind: "text",
        text: "Deleting the empty conversations now.",
        toolName: "",
      },
      {
        id: toolProjectionId("asst-ordered", "call-delete"),
        kind: "tool",
        text: "",
        toolName: "mutateDb",
      },
    ]);
    expect(secondStep.map((row) => ({ id: row.id, kind: row.kind, text: row.text, toolName: row.toolName }))).toEqual([
      {
        id: toolProjectionId("asst-ordered", "call-verify"),
        kind: "tool",
        text: "",
        toolName: "queryDb",
      },
      {
        id: textProjectionId("asst-ordered", 5),
        kind: "text",
        text: "Nothing remains.",
        toolName: "",
      },
    ]);
  });

  it("gives each step its own text row even when the text repeats", () => {
    const step = (stepNumber: number, startSeq: number, text: string) =>
      projectionRowsFromStep({
        conversationId: "c1",
        sessionMessageId: "asst-3",
        stepNumber,
        startSeq,
        createdAt: 1,
        text,
        tools: [],
      });

    const first = step(0, 1, "Working on it.");
    const second = step(1, 2, "Working on it.");

    expect(first[0]?.id).not.toBe(second[0]?.id);
    expect([first[0]?.seq, second[0]?.seq]).toEqual([1, 2]);
  });

  it("targets the same row when a step is re-delivered, so the upsert overwrites", () => {
    const redelivered = (startSeq: number) =>
      projectionRowsFromStep({
        conversationId: "c1",
        sessionMessageId: "asst-4",
        stepNumber: 2,
        startSeq,
        createdAt: 1,
        text: "Retried.",
        tools: [],
      })[0];

    expect(redelivered(9)?.id).toBe(redelivered(14)?.id);
  });

  function toolRowData(tool: StepToolSnapshot): unknown {
    const [row] = projectionRowsFromStep({
      conversationId: "c1",
      sessionMessageId: "asst-payload",
      stepNumber: 0,
      startSeq: 1,
      createdAt: 1,
      text: "",
      tools: [tool],
    });
    return row?.data ? JSON.parse(row.data) : row?.data;
  }

  it("keeps only the fields a chip draws, trimming web results", () => {
    expect(
      toolRowData({
        toolCallId: "c",
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
        error: false,
      }),
    ).toEqual({
      query: "eur rate",
      answer: "x".repeat(600),
      results: Array.from({ length: 8 }, (_, i) => ({ title: `Result ${i}`, url: `https://example.com/${i}` })),
    });

    expect(
      toolRowData({
        toolCallId: "c",
        toolName: "web_extract",
        input: { urls: ["https://a.test", "https://b.test"] },
        output: {
          results: [{ url: "https://a.test", rawContent: "z".repeat(9000) }],
          failedResults: [{ url: "https://b.test", error: "timeout" }],
        },
        error: false,
      }),
    ).toEqual({
      urlCount: 2,
      results: [{ url: "https://a.test" }],
      failedResults: [{ url: "https://b.test" }],
    });
  });

  it("projects memory, read, and skill payloads", () => {
    expect(
      toolRowData({
        toolCallId: "c",
        toolName: "remember",
        input: { content: "Prefers EUR" },
        output: {},
        error: false,
      }),
    ).toEqual({ content: "Prefers EUR" });

    expect(
      toolRowData({
        toolCallId: "c",
        toolName: "read_skill_resource",
        input: { path: "/skills/x/steps.md" },
        output: {},
        error: false,
      }),
    ).toEqual({ path: "/skills/x/steps.md" });

    expect(
      toolRowData({
        toolCallId: "c",
        toolName: "create_skill",
        input: { name: "Monthly review", whenToUse: "...", instructions: "..." },
        output: { id: "skill-1", name: "Monthly review", status: "pending" },
        error: false,
      }),
    ).toEqual({ id: "skill-1", name: "Monthly review" });

    expect(
      toolRowData({
        toolCallId: "c",
        toolName: "create_skill",
        input: { name: "Monthly review" },
        output: undefined,
        error: true,
      }),
    ).toEqual({ id: null, name: "Monthly review" });
  });

  it("stores nothing for tools whose chip needs no payload", () => {
    expect(toolRowData({ toolCallId: "c", toolName: "forget", input: { id: "m1" }, output: {}, error: false })).toBe(
      "",
    );
    expect(
      toolRowData({ toolCallId: "c", toolName: "queryDb", input: { sql: "select 1" }, output: {}, error: false }),
    ).toBe("");
  });
});

describe("stepToolsFromContext", () => {
  it("preserves successful and failed tool outcomes", () => {
    const context = {
      toolCalls: [
        {
          type: "tool-call",
          toolCallId: "call-success",
          toolName: "queryDb",
          input: { sql: "select 1" },
          dynamic: true,
        },
        {
          type: "tool-call",
          toolCallId: "call-error",
          toolName: "queryDb",
          input: { sql: "invalid" },
          dynamic: true,
        },
      ],
      content: [
        {
          type: "tool-result",
          toolCallId: "call-success",
          toolName: "queryDb",
          input: { sql: "select 1" },
          output: { rows: [] },
          dynamic: true,
        },
        {
          type: "tool-error",
          toolCallId: "call-error",
          toolName: "queryDb",
          input: { sql: "invalid" },
          error: "SQL failed",
          dynamic: true,
        },
      ],
    } satisfies Pick<StepContext, "content" | "toolCalls">;

    const tools = stepToolsFromContext(context);
    expect(tools).toEqual([
      {
        toolCallId: "call-success",
        toolName: "queryDb",
        input: { sql: "select 1" },
        output: { rows: [] },
        error: false,
      },
      {
        toolCallId: "call-error",
        toolName: "queryDb",
        input: { sql: "invalid" },
        output: "SQL failed",
        error: true,
      },
    ]);

    const rows = projectionRowsFromStep({
      conversationId: "c1",
      sessionMessageId: "asst-tools",
      stepNumber: 0,
      startSeq: 1,
      createdAt: 1,
      text: "",
      tools,
    });
    expect(rows.map((row) => row.toolState)).toEqual(["done", "error"]);
  });
});
