import { type ContractRouterClient, oc } from "@orpc/contract";
import { z } from "zod";
import { isAssistantModelId, isAssistantReasoningEffort } from "../agent/models";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES, uploadTotalBytes } from "../agent/uploads";

export const orpcErrors = {
  UNAUTHORIZED: {},
  NOT_FOUND: {},
  BAD_REQUEST: {},
  FORBIDDEN: {},
} as const;

const base = oc.errors(orpcErrors);

const sessionUserSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  assistantEnabled: z.boolean(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

const conversationIdInput = z.object({ conversationId: z.string().min(1) });

const turnFilesInput = z
  .array(z.file())
  .max(MAX_UPLOAD_FILES)
  .refine((files) => uploadTotalBytes(files) <= MAX_UPLOAD_BYTES, {
    message: "Combined upload is too large.",
  })
  .default([]);

function hasTurnContent(input: { text: string; files: readonly unknown[] }) {
  return input.text.trim().length > 0 || input.files.length > 0;
}

export const apiContract = {
  auth: {
    mobile: {
      requestCode: base.input(z.object({ email: z.email() })).output(z.object({ success: z.literal(true) })),
      verifyCode: base
        .input(z.object({ email: z.email(), code: z.string().length(6) }))
        .output(
          z.discriminatedUnion("success", [
            z.object({ success: z.literal(true), token: z.string(), user: sessionUserSchema }),
            z.object({ success: z.literal(false), error: z.string() }),
          ]),
        ),
      getSession: base.output(sessionUserSchema),
      signOut: base.output(z.object({ success: z.literal(true) })),
    },
  },
  assistant: {
    startConversation: base
      .input(
        z
          .object({
            conversationId: z.string().min(1),
            turnId: z.string().min(1),
            text: z.string(),
            model: z.string().refine(isAssistantModelId, "Unknown assistant model."),
            reasoningEffort: z
              .string()
              .nullable()
              .refine((value) => value === null || isAssistantReasoningEffort(value), "Unknown reasoning effort."),
            files: turnFilesInput,
          })
          .refine(hasTurnContent, { message: "Message is empty." }),
      )
      .output(z.object({ conversationId: z.string(), accepted: z.boolean(), messageId: z.string() })),
    submitTurn: base
      .input(
        z
          .object({
            conversationId: z.string().min(1),
            turnId: z.string().min(1),
            text: z.string(),
            files: turnFilesInput,
          })
          .refine(hasTurnContent, { message: "Message is empty." }),
      )
      .output(z.object({ accepted: z.boolean(), messageId: z.string() })),
    cancelTurn: base.input(conversationIdInput).output(z.object({ ok: z.literal(true) })),
    /** Wakes the conversation's agent, backfilling its transcript projection if needed. */
    ensureProjection: base.input(conversationIdInput).output(z.object({ ok: z.literal(true) })),
  },
};

export type ApiClient = ContractRouterClient<typeof apiContract>;
