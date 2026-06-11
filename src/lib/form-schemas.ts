import { type FormValidateOrFn, revalidateLogic } from "@tanstack/react-form";
import { z } from "zod";

type ZodRefinementCtx = {
  addIssue: (issue: { code: "custom"; message: string; path?: PropertyKey[] }) => void;
};

type RevalidateLogicOptions = NonNullable<Parameters<typeof revalidateLogic>[0]>;

export function createDynamicValidationLogic(options?: RevalidateLogicOptions) {
  return revalidateLogic(options);
}

export function dynamicZodValidators<TSchema extends FormValidateOrFn<any>>(schema: TSchema) {
  return {
    onDynamic: schema,
  } as { onDynamic: TSchema };
}

export function finiteAmountString(fieldName: string) {
  return z.string().superRefine((value, ctx) => {
    addFiniteAmountIssue(value, fieldName, ctx);
  });
}

export function positiveAmountString(fieldName: string) {
  return finiteAmountString(fieldName).superRefine((value, ctx) => {
    const amount = Number.parseFloat(value);
    if (Number.isFinite(amount) && amount <= 0) {
      ctx.addIssue({ code: "custom", message: `${fieldName} must be greater than 0.` });
    }
  });
}

export function dateTimeLocalString() {
  return z.string().superRefine((value, ctx) => {
    if (!Number.isFinite(new Date(value).getTime())) {
      ctx.addIssue({ code: "custom", message: "Please enter a valid date and time." });
    }
  });
}

export function addFiniteAmountIssue(
  value: string,
  fieldName: string,
  ctx: ZodRefinementCtx,
  path: PropertyKey[] = [],
) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) {
    ctx.addIssue({ code: "custom", message: `${fieldName} must be a valid number.`, path });
  }
}

export function addPositiveAmountIssue(
  value: string,
  fieldName: string,
  ctx: ZodRefinementCtx,
  path: PropertyKey[] = [],
) {
  addFiniteAmountIssue(value, fieldName, ctx, path);
  const amount = Number.parseFloat(value);
  if (Number.isFinite(amount) && amount <= 0) {
    ctx.addIssue({ code: "custom", message: `${fieldName} must be greater than 0.`, path });
  }
}
