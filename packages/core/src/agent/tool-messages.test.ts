import { describe, expect, it } from "vitest";
import {
  assistantDownloadPath,
  downloadFileFromData,
  isMemoryToolName,
  linkHostname,
  memoryToolLabel,
  resourceFilename,
  toolLabel,
  toolLinks,
  toolPayload,
  webToolSummary,
} from "./tool-messages";

describe("toolPayload", () => {
  it("parses objects and falls back to an empty payload", () => {
    expect(toolPayload<{ query?: string }>('{"query":"rates"}').query).toBe("rates");
    expect(toolPayload("not json")).toEqual({});
    expect(toolPayload("")).toEqual({});
    expect(toolPayload("42")).toEqual({});
  });
});

describe("toolLinks", () => {
  it("keeps only entries with a url", () => {
    expect(toolLinks([{ url: "https://a.com" }, { title: "x" } as never, null as never])).toEqual([
      { url: "https://a.com" },
    ]);
    expect(toolLinks(undefined)).toEqual([]);
  });
});

describe("linkHostname", () => {
  it("strips www and survives invalid urls", () => {
    expect(linkHostname("https://www.example.com/path?q=1")).toBe("example.com");
    expect(linkHostname("nope")).toBe("nope");
  });
});

describe("resourceFilename", () => {
  it("takes the last path segment", () => {
    expect(resourceFilename("/uploads/t1/00-report.pdf")).toBe("00-report.pdf");
    expect(resourceFilename("C:\\files\\a.txt")).toBe("a.txt");
    expect(resourceFilename("dir/")).toBe("dir/");
  });
});

describe("webToolSummary", () => {
  it("shows the query for searches and a page count for extracts", () => {
    expect(webToolSummary("web_search", { query: "eur usd" })).toBe("eur usd");
    expect(webToolSummary("web_extract", { urlCount: 1 })).toBe("1 page");
    expect(webToolSummary("web_extract", { urlCount: 3 })).toBe("3 pages");
    expect(webToolSummary("web_extract", {})).toBeUndefined();
  });
});

describe("memory tools", () => {
  it("labels each memory tool", () => {
    expect(memoryToolLabel("remember")).toBe("Remembered");
    expect(memoryToolLabel("update_memory")).toBe("Updated a memory");
    expect(memoryToolLabel("forget")).toBe("Forgot a memory");
    expect(isMemoryToolName("forget")).toBe(true);
    expect(isMemoryToolName("read")).toBe(false);
  });
});

describe("toolLabel", () => {
  it("names known tools and humanizes the rest", () => {
    expect(toolLabel("queryDb")).toBe("Queried your data");
    expect(toolLabel("execute")).toBe("Ran code");
    expect(toolLabel("listCalendarEvents")).toBe("List calendar events");
    expect(toolLabel("send_email")).toBe("Send email");
    expect(toolLabel("")).toBe("Used a tool");
  });
});

describe("downloadFileFromData", () => {
  it("fills defaults and rejects payloads without a name or path", () => {
    expect(downloadFileFromData('{"filename":"a.csv","path":"/downloads/a.csv"}')).toEqual({
      filename: "a.csv",
      mediaType: "application/octet-stream",
      size: 0,
      path: "/downloads/a.csv",
    });
    expect(downloadFileFromData('{"filename":"a.csv"}')).toBeNull();
    expect(downloadFileFromData("")).toBeNull();
  });
});

describe("assistantDownloadPath", () => {
  it("encodes both parameters", () => {
    expect(assistantDownloadPath("c 1", "/downloads/a b.csv")).toBe(
      "/api/assistant/download?conversationId=c%201&path=%2Fdownloads%2Fa%20b.csv",
    );
  });
});
