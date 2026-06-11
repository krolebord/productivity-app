import { Think } from "@cloudflare/think";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createDbTools } from "@sqlite-sync/ai";
import type { ToolSet } from "ai";
import { getServerByName } from "partyserver";

export class AssistantAgent extends Think<Env> {
  getModel() {
    const openrouter = createOpenRouter({
      apiKey: this.env.OPENROUTER_API_KEY,
    });
    return openrouter.chat("openai/gpt-5.4-mini");
  }

  getSystemPrompt() {
    return [
      "You are the built-in assistant of a personal productivity app with notes, accounts, and transactions.",
      "Help the user think through their notes, finances, and plans.",
      "The user's data lives in a synced SQLite database. Use the getDbSchema tool to learn how it is structured before reasoning about the user's data.",
      "Be concise and direct. Use markdown when it improves readability.",
    ].join("\n");
  }

  getTools(): ToolSet {
    return createDbTools({ access: () => this.getUserDbStub() });
  }

  private async getUserDbStub() {
    // Agent instances are named `${userDbName}:${conversationId}` (see the guard in server.ts).
    const separatorIndex = this.name.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Unexpected agent name without a user-db prefix: ${this.name}`);
    }
    const userDbName = this.name.slice(0, separatorIndex);
    return await getServerByName(this.env.UserDbServer, userDbName, { locationHint: "weur" });
  }
}
