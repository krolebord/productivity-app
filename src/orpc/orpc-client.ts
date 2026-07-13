import { createORPCClient, type InferClientErrorUnion, isDefinedError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ClientRetryPluginContext } from "@orpc/client/plugins";
import type { InferRouterOutputs, RouterClient } from "@orpc/server";
import { createTanstackQueryUtils, type RouterUtils } from "@orpc/tanstack-query";
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import type { orpcRouter } from "./orpc-router";

interface ORPCClientContext extends ClientRetryPluginContext {}

export type BaseORPCClient = RouterClient<typeof orpcRouter>;

type ORPCClientError = InferClientErrorUnion<BaseORPCClient>;

export type ORPCClient = RouterUtils<BaseORPCClient>;

const link = new RPCLink<ORPCClientContext>({
  url: () => {
    // Origin-relative so the app works from any host it's served on;
    // VITE_APP_URL stays the canonical URL for server-side use (emails, OAuth).
    return `${globalThis.location.origin}/rpc`;
  },
});

const orpcClient: BaseORPCClient = createORPCClient(link);

export const orpc: ORPCClient = createTanstackQueryUtils(orpcClient);

export type ORPCOutputs = InferRouterOutputs<typeof orpcRouter>;

export function setupOrpcQueryClientIntegration<TRouter extends AnyRouter>(queryClient: QueryClient, router: TRouter) {
  const handleORPCClientError = (error: ORPCClientError): boolean => {
    if (!isDefinedError(error)) {
      return false;
    }

    if (error.code === "UNAUTHORIZED" && router.state.location.pathname !== "/sign-in") {
      router.navigate({ to: "/sign-in", replace: true });
      return true;
    }

    return false;
  };

  const ogMutationCacheConfig = queryClient.getMutationCache().config;
  queryClient.getMutationCache().config = {
    ...ogMutationCacheConfig,
    onError: (error: ORPCClientError, ...rest) => {
      if (handleORPCClientError(error)) {
        return;
      }

      return ogMutationCacheConfig.onError?.(error, ...rest);
    },
  };

  const ogQueryCacheConfig = queryClient.getQueryCache().config;
  queryClient.getQueryCache().config = {
    ...ogQueryCacheConfig,
    onError: (error: ORPCClientError, ...rest) => {
      if (handleORPCClientError(error)) {
        return;
      }

      return ogQueryCacheConfig.onError?.(error, ...rest);
    },
  };
}
