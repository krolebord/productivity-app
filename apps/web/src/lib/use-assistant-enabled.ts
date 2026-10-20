import { useSuspenseQuery } from "@tanstack/react-query";
import { orpc } from "@/orpc/orpc-client";

// Whether the current user is allowlisted for the (cost-incurring) assistant.
// The `_app` loader already primes this query, so the suspense resolves instantly.
export function useAssistantEnabled(): boolean {
  const { data } = useSuspenseQuery(orpc.auth.getAuth.queryOptions());
  return data?.assistantEnabled ?? false;
}
