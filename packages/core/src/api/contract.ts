import { type ContractRouterClient, oc } from "@orpc/contract";
import { z } from "zod";

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
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

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
};

export type ApiClient = ContractRouterClient<typeof apiContract>;
