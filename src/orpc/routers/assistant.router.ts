import { getAgentByName } from "agents";
import { z } from "zod";
import type { AssistantTurnError } from "@/agent/assistant-agent";
import {
  isAssistantModelId,
  isAssistantReasoningEffort,
  modelSupportsSelectableReasoning,
  resolveAssistantModelId,
  resolveAssistantReasoningEffort,
} from "@/agent/models";
import { isAssistantAllowed } from "@/lib/assistant-access";
import { getContext } from "@/lib/context";
import { getUserDbStub } from "@/lib/user-db-stub";
import { protectedProcedure } from "../common/procedure";

const conversationIdInput = z.object({
  conversationId: z.string().min(1),
});

const assistantProcedure = protectedProcedure.use(async ({ context, next, errors }) => {
  if (!isAssistantAllowed(context.auth.userEmail)) {
    throw errors.FORBIDDEN({ message: "Assistant is not enabled for this account." });
  }
  return next();
});

const assistantModelInput = z.string().refine(isAssistantModelId, "Unknown assistant model.");
const reasoningEffortInput = z
  .string()
  .nullable()
  .refine((value) => value === null || isAssistantReasoningEffort(value), "Unknown reasoning effort.");

async function getAssistantAgent(userId: string, conversationId: string) {
  const env = getContext();
  return getAgentByName(env.AssistantAgent, `user-${userId}:${conversationId}`, { locationHint: "weur" });
}

function throwAssistantError(
  errors: {
    NOT_FOUND: (opts?: { message?: string }) => unknown;
    BAD_REQUEST: (opts?: { message?: string }) => unknown;
  },
  error: AssistantTurnError,
): never {
  if (error.code === "NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

const submitTurn = assistantProcedure
  .input(
    z.object({
      conversationId: z.string().min(1),
      turnId: z.string().min(1),
      text: z.string().min(1),
    }),
  )
  .handler(async ({ input, context, errors }) => {
    const agent = await getAssistantAgent(context.auth.userId, input.conversationId);
    const result = await agent.submitTurn({ turnId: input.turnId, text: input.text });
    if (result.error) {
      throwAssistantError(errors, result.error);
    }
    return { accepted: result.accepted };
  });

const startConversation = assistantProcedure
  .input(
    z.object({
      conversationId: z.string().min(1),
      text: z.string().min(1),
      model: assistantModelInput,
      reasoningEffort: reasoningEffortInput,
    }),
  )
  .handler(async ({ input, context, errors }) => {
    const model = resolveAssistantModelId(input.model);
    const reasoningEffort = modelSupportsSelectableReasoning(model)
      ? (resolveAssistantReasoningEffort(model, input.reasoningEffort) ?? null)
      : null;
    const agent = await getAssistantAgent(context.auth.userId, input.conversationId);
    const result = await agent.startConversation({ text: input.text, model, reasoningEffort });
    if (result.error) {
      throwAssistantError(errors, result.error);
    }
    return {
      conversationId: input.conversationId,
      accepted: result.accepted,
    };
  });

const cancelTurn = assistantProcedure.input(conversationIdInput).handler(async ({ input, context, errors }) => {
  const agent = await getAssistantAgent(context.auth.userId, input.conversationId);
  const result = await agent.cancelTurn();
  if (result.error) {
    throwAssistantError(errors, result.error);
  }
  return { ok: true as const };
});

const ensureProjection = assistantProcedure.input(conversationIdInput).handler(async ({ input, context, errors }) => {
  const agent = await getAssistantAgent(context.auth.userId, input.conversationId);
  const result = await agent.ensureProjection();
  if (result.error) {
    throwAssistantError(errors, result.error);
  }
  return { ok: true as const };
});

const deleteConversation = assistantProcedure.input(conversationIdInput).handler(async ({ input, context }) => {
  const stub = await getUserDbStub(context.auth.userId);
  return { deleted: await stub.deleteConversation(input.conversationId) };
});

export const assistantRouter = {
  startConversation,
  submitTurn,
  cancelTurn,
  ensureProjection,
  deleteConversation,
};
