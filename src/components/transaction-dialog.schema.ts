import { z } from "zod";
import { addFiniteAmountIssue, addPositiveAmountIssue, dateTimeLocalString } from "@/lib/form-schemas";
import { TRANSACTION_TYPES } from "@/lib/transactions";

export function createTransactionFormSchema(accountCount: number) {
  return z
    .object({
      type: z.enum(TRANSACTION_TYPES),
      accountId: z.string().min(1, "Account is required."),
      counterpartyAccountId: z.string(),
      amount: z.string(),
      counterpartyAmount: z.string(),
      effectiveAt: dateTimeLocalString(),
      title: z.string(),
      category: z.string(),
      notes: z.string(),
    })
    .superRefine((data, ctx) => {
      switch (data.type) {
        case "expense":
        case "income":
          addPositiveAmountIssue(data.amount, "Amount", ctx, ["amount"]);
          break;
        case "adjustment": {
          addFiniteAmountIssue(data.amount, "Amount", ctx, ["amount"]);
          const amount = Number.parseFloat(data.amount);
          if (Number.isFinite(amount) && amount === 0) {
            ctx.addIssue({ code: "custom", message: "Adjustment amount cannot be 0.", path: ["amount"] });
          }
          break;
        }
        case "transfer": {
          if (accountCount < 2) {
            ctx.addIssue({
              code: "custom",
              message: "Create at least two accounts before recording a transfer.",
              path: ["type"],
            });
          }

          addPositiveAmountIssue(data.amount, "Source amount", ctx, ["amount"]);
          addPositiveAmountIssue(data.counterpartyAmount, "Destination amount", ctx, ["counterpartyAmount"]);

          if (!data.counterpartyAccountId) {
            ctx.addIssue({
              code: "custom",
              message: "Destination account is required.",
              path: ["counterpartyAccountId"],
            });
          }

          if (data.accountId && data.counterpartyAccountId && data.accountId === data.counterpartyAccountId) {
            ctx.addIssue({
              code: "custom",
              message: "Transfer accounts must be different.",
              path: ["accountId"],
            });
            ctx.addIssue({
              code: "custom",
              message: "Transfer accounts must be different.",
              path: ["counterpartyAccountId"],
            });
          }
          break;
        }
      }
    });
}
