import { os } from "@orpc/server";
import {
  modelSupportsSelectableReasoning,
  resolveAssistantReasoningEffort,
  resolveSelectableAssistantModelId,
} from "@productivity/core/agent/models";
import { orpcErrors } from "@productivity/core/api/contract";
import { getAgentByName } from "agents";
import type { AssistantTurnError, WorkspaceUploadInput } from "@/agent/assistant-agent";
import { isAssistantAllowed } from "@/lib/assistant-access";
import { getContext } from "@/lib/context";
import { type AuthSession, authMiddleware } from "../common/auth";
import { contractApi } from "../common/contract";

const api = contractApi.assistant;

const assistantAccess = os
  .$context<{ auth: AuthSession }>()
  .errors(orpcErrors)
  .middleware(async ({ context, next, errors }) => {
    if (!isAssistantAllowed(context.auth.userEmail)) {
      throw errors.FORBIDDEN({ message: "Assistant is not enabled for this account." });
    }
    return next();
  });
async function workspaceUploadsFromFiles(files: File[]): Promise<WorkspaceUploadInput[]> {
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name || "upload",
      mediaType: file.type || "application/octet-stream",
      bytes: await file.arrayBuffer(),
    })),
  );
}

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

const submitTurn = api.submitTurn
  .use(authMiddleware)
  .use(assistantAccess)
  .handler(async ({ input, context, errors }) => {
    const agent = await getAssistantAgent(context.auth.userId, input.conversationId);
    const result = await agent.submitTurn({
      turnId: input.turnId,
      text: input.text,
      files: await workspaceUploadsFromFiles(input.files),
    });
    if (result.error) {
      throwAssistantError(errors, result.error);
    }
    return { accepted: result.accepted === true, messageId: input.turnId };
  });

const startConversation = api.startConversation
  .use(authMiddleware)
  .use(assistantAccess)
  .handler(async ({ input, context, errors }) => {
    const model = resolveSelectableAssistantModelId(input.model);
    const reasoningEffort = modelSupportsSelectableReasoning(model)
      ? (resolveAssistantReasoningEffort(model, input.reasoningEffort) ?? null)
      : null;
    const agent = await getAssistantAgent(context.auth.userId, input.conversationId);
    const result = await agent.startConversation({
      turnId: input.turnId,
      text: input.text,
      model,
      reasoningEffort,
      files: await workspaceUploadsFromFiles(input.files),
    });
    if (result.error) {
      throwAssistantError(errors, result.error);
    }
    return {
      conversationId: input.conversationId,
      accepted: result.accepted === true,
      messageId: input.turnId,
    };
  });

const cancelTurn = api.cancelTurn
  .use(authMiddleware)
  .use(assistantAccess)
  .handler(async ({ input, context, errors }) => {
    const agent = await getAssistantAgent(context.auth.userId, input.conversationId);
    const result = await agent.cancelTurn();
    if (result.error) {
      throwAssistantError(errors, result.error);
    }
    return { ok: true as const };
  });

const ensureProjection = api.ensureProjection
  .use(authMiddleware)
  .use(assistantAccess)
  .handler(async ({ input, context, errors }) => {
    const agent = await getAssistantAgent(context.auth.userId, input.conversationId);
    const result = await agent.ensureProjection();
    if (result.error) {
      throwAssistantError(errors, result.error);
    }
    return { ok: true as const };
  });

export const assistantRouter = {
  startConversation,
  submitTurn,
  cancelTurn,
  ensureProjection,
};
