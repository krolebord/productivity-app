import { z } from "zod";

/** A single Monobank statement item, as delivered in a `StatementItem` webhook event. */
export const monobankStatementItemSchema = z.object({
  id: z.string(),
  time: z.number(),
  description: z.string().default(""),
  mcc: z.number().optional(),
  originalMcc: z.number().optional(),
  hold: z.boolean().optional(),
  amount: z.number(),
  operationAmount: z.number().optional(),
  currencyCode: z.number().optional(),
  commissionRate: z.number().optional(),
  cashbackAmount: z.number().optional(),
  balance: z.number().optional(),
  comment: z.string().optional(),
  receiptId: z.string().optional(),
});

export type MonobankStatementItem = z.infer<typeof monobankStatementItemSchema>;

/** The webhook body Monobank POSTs for a new statement item. */
export const monobankWebhookPayloadSchema = z.object({
  type: z.literal("StatementItem"),
  data: z.object({
    account: z.string(),
    statementItem: monobankStatementItemSchema,
  }),
});

export type MonobankWebhookPayload = z.infer<typeof monobankWebhookPayloadSchema>;

/** Central D1 connection status enums, enforced in application code. */
export const MONOBANK_CONNECTION_STATUSES = ["connected", "disconnected", "error"] as const;
export type MonobankConnectionStatus = (typeof MONOBANK_CONNECTION_STATUSES)[number];

export const MONOBANK_WEBHOOK_STATUSES = ["pending", "active", "error"] as const;
export type MonobankWebhookStatus = (typeof MONOBANK_WEBHOOK_STATUSES)[number];

export const MONOBANK_PROVIDER_TYPE = "monobank" as const;
