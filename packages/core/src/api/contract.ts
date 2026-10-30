import { type ContractRouterClient, oc } from "@orpc/contract";
import { z } from "zod";
import { isAssistantModelId, isAssistantReasoningEffort } from "../agent/models";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES, uploadTotalBytes } from "../agent/uploads";
import { APP_CURRENCIES } from "../currency/currencies";
import { isValidTimeZone } from "../time-zone";

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

const successOutput = z.object({ success: z.literal(true) });

const mcpTokenAccessSchema = z.enum(["read", "read-write"]);

export type McpTokenAccess = z.infer<typeof mcpTokenAccessSchema>;

const mcpTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  access: mcpTokenAccessSchema,
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

const monobankTokenInput = z.object({
  token: z.string().trim().min(20, "That does not look like a valid Monobank token."),
});

const calendarConnectionInput = z.object({ connectionId: z.string() });

const calendarSyncStatusSchema = z.object({
  providerConnectionId: z.string(),
  /** Epoch ms of the last completed sync, or null. */
  lastSyncedAt: z.number().nullable(),
  lastError: z.string(),
  calendars: z.array(
    z.object({ providerCalendarId: z.string(), lastSyncedAt: z.number().nullable(), lastError: z.string() }),
  ),
});

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
  currency: {
    /** Fetches today's rates into the user DB; the new row reaches clients through sync. */
    refresh: base
      .input(z.object({ baseCurrency: z.enum(APP_CURRENCIES).default("USD") }))
      .output(z.object({ date: z.string(), base: z.enum(APP_CURRENCIES) })),
  },
  settings: {
    /** Saves the timezone only when none is saved yet, returning whichever zone is in effect. */
    initTimeZone: base
      .input(z.object({ timeZone: z.string().refine(isValidTimeZone, "Unknown timezone.") }))
      .output(z.object({ timeZone: z.string() })),
  },
  mcp: {
    listTokens: base.output(z.array(mcpTokenSchema)),
    /** The token itself is only ever returned here; the server keeps a hash. */
    createToken: base
      .input(z.object({ name: z.string().trim().min(1).max(80), access: mcpTokenAccessSchema }))
      .output(z.object({ id: z.string(), token: z.string() })),
    revokeToken: base.input(z.object({ id: z.string() })).output(successOutput),
  },
  integrations: {
    monobank: {
      connect: base.input(monobankTokenInput).output(successOutput),
      replaceToken: base.input(monobankTokenInput).output(successOutput),
      refreshAccounts: base.output(successOutput),
      disconnect: base.output(successOutput),
    },
    // Connecting needs the browser's OAuth cookies, so it stays a web-only procedure.
    googleCalendar: {
      getSyncStatus: base.output(z.object({ connections: z.array(calendarSyncStatusSchema) })),
      refreshCalendars: base.input(calendarConnectionInput).output(successOutput),
      syncNow: base.input(z.object({ connectionId: z.string().nullable().default(null) })).output(successOutput),
      setCalendarEnabled: base
        .input(
          calendarConnectionInput.extend({
            sourceId: z.string(),
            providerCalendarId: z.string(),
            enabled: z.boolean(),
          }),
        )
        .output(successOutput),
      disconnect: base.input(calendarConnectionInput).output(successOutput),
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

export type McpToken = z.infer<typeof mcpTokenSchema>;
export type CalendarSyncStatusReport = z.infer<typeof calendarSyncStatusSchema>;
