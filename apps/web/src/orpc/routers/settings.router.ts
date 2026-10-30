import { getUserDbStub } from "@/lib/user-db-stub";
import { authMiddleware } from "../common/auth";
import { contractApi } from "../common/contract";

export const settingsRouter = {
  initTimeZone: contractApi.settings.initTimeZone.use(authMiddleware).handler(async ({ input, context }) => {
    const stub = await getUserDbStub(context.auth.userId);
    return stub.initTimeZone(input.timeZone);
  }),
};
