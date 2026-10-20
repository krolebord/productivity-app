import { z } from "zod";
import { defineJob } from "./jobs-base";

export const cleanupConversationAgentJob = defineJob({ type: "cleanup-conversation-agent" })
  .input(z.object({ agentName: z.string() }))
  .handler(async ({ input, context }) => {
    const namespace = context.env.AssistantAgent;
    const stub = namespace.get(namespace.idFromName(input.agentName));

    try {
      await stub.destroy();
    } catch (error) {
      // destroy() aborts the agent's isolate, so the RPC may not return cleanly.
      console.log(`Conversation agent destroy for ${input.agentName} did not return cleanly`, error);
    }
  });
