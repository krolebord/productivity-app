import { isValidTimeZone } from "@productivity/core/time-zone";
import { z } from "zod";
import { getUserDbStub } from "@/lib/user-db-stub";
import { protectedProcedure } from "../common/procedure";

export const settingsRouter = {
  initTimeZone: protectedProcedure
    .input(z.object({ timeZone: z.string().refine(isValidTimeZone, "Unknown timezone.") }))
    .handler(async ({ input, context }) => {
      const stub = await getUserDbStub(context.auth.userId);
      return stub.initTimeZone(input.timeZone);
    }),
};
