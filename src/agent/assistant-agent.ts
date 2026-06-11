import { Think } from "@cloudflare/think";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

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
      "Be concise and direct. Use markdown when it improves readability.",
    ].join("\n");
  }
}
