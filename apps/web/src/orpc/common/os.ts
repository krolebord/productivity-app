import { os } from "@orpc/server";
import type { RequestHeadersPluginContext, ResponseHeadersPluginContext } from "@orpc/server/plugins";
import { orpcErrors } from "@productivity/core/api/contract";

export interface ORPCContext extends RequestHeadersPluginContext, ResponseHeadersPluginContext {}

export const osBase = os.$context<ORPCContext>().errors(orpcErrors);
