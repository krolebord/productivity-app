import { tavily } from "@tavily/core";
import { tool } from "ai";
import { z } from "zod";

export function createWebTools(apiKey: string) {
  const client = tavily({ apiKey });

  return {
    web_search: tool({
      description:
        "Search the web for real-time information using Tavily's AI-optimized search engine. Returns relevant sources, snippets, and optional AI-generated answers.",
      inputSchema: z.object({
        query: z.string().describe("The search query to look up on the web"),
        searchDepth: z
          .enum(["basic", "advanced", "fast", "ultra-fast"])
          .optional()
          .describe(
            "The depth of the search - 'basic' for quick results, 'advanced' for comprehensive search, 'fast' for low latency with high relevance (BETA), 'ultra-fast' prioritizes latency above all (BETA)",
          ),
        timeRange: z
          .enum(["year", "month", "week", "day", "y", "m", "w", "d"])
          .optional()
          .describe("Time range for search results"),
        exactMatch: z
          .boolean()
          .optional()
          .describe("Only return results containing the exact phrase(s) in quotes in your query"),
      }),
      execute: ({ query, searchDepth, timeRange, exactMatch }) =>
        client.search(query, {
          searchDepth: searchDepth ?? "basic",
          includeAnswer: true,
          maxResults: 5,
          timeRange,
          ...(exactMatch !== undefined ? { exactMatch } : {}),
        }),
    }),
    web_extract: tool({
      description:
        "Extract clean, structured content from one or more URLs. Returns parsed content in markdown or text format, optimized for AI consumption.",
      inputSchema: z.object({
        urls: z.array(z.string()).describe("Array of URLs to extract content from"),
        extractDepth: z
          .enum(["basic", "advanced"])
          .optional()
          .describe(
            "Extraction depth - 'basic' for main content, 'advanced' for comprehensive extraction (default: 'basic')",
          ),
        query: z.string().optional().describe("User intent query for reranking extracted content chunks"),
      }),
      execute: ({ urls, extractDepth, query }) =>
        client.extract(urls, { extractDepth: extractDepth ?? "basic", query }),
    }),
  };
}
