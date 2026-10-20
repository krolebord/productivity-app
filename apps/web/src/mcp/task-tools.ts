import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getUserDbStub } from "@/lib/user-db-stub";
import { createTaskInput, getAgendaInput, updateTaskInput } from "@/user-db/task-operations";

function toToolResult(result: object): CallToolResult {
  if ("error" in result && typeof result.error === "string") {
    return { content: [{ type: "text", text: result.error }], isError: true };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result as Record<string, unknown>,
  };
}

export function registerTaskTools(server: McpServer, options: { userId: string; mutations: boolean }) {
  const stub = () => getUserDbStub(options.userId);

  server.registerTool(
    "getAgenda",
    {
      title: "Get agenda",
      description:
        "The user's plan for one or more days, as the app's Today view shows it: tasks and due habits grouped into Overdue (today only), Morning, Afternoon, Anytime, Evening, and Night, plus open Inbox tasks without a date. Dates and times are in the user's timezone. Use queryDb for history or search.",
      inputSchema: getAgendaInput.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => toToolResult(await (await stub()).getAgenda(input)),
  );

  if (!options.mutations) return;

  server.registerTool(
    "createTask",
    {
      title: "Create task",
      description:
        "Create a task. With `due` it is scheduled on that local day, all-day unless `time` is given; without `due` it goes to the Inbox. Returns the new task with its id.",
      inputSchema: createTaskInput.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => toToolResult(await (await stub()).createTask(input)),
  );

  server.registerTool(
    "updateTask",
    {
      title: "Update task",
      description:
        "Change a task: rename it, replace its content, reschedule it (`due`, or null for the Inbox), complete or reopen it, or add and remove tags. Only the fields you pass change. Tasks mirrored from Google Calendar accept only `completed` and tag changes.",
      inputSchema: updateTaskInput.shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => toToolResult(await (await stub()).updateTask(input)),
  );
}
