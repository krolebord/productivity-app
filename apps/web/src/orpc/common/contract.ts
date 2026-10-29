import { implement } from "@orpc/server";
import { apiContract } from "@productivity/core/api/contract";
import { loggingMiddleware } from "./logging";
import type { ORPCContext } from "./os";

/** Implements procedures declared in the shared contract (called by mobile as well as web). */
export const contractApi = implement(apiContract).$context<ORPCContext>().use(loggingMiddleware);
