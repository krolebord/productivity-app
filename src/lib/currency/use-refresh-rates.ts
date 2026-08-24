import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/orpc/orpc-client";

/**
 * Asks the user's Durable Object to fetch and store today's rates.
 * The DO is the sole writer; the UI picks up the new row via sync.
 */
export function useRefreshRates() {
  const mutation = useMutation(
    orpc.currency.refresh.mutationOptions({
      onSuccess: (data) => {
        toast.success("Currency rates refreshed.", {
          description: `Stored rates for ${data.date}.`,
        });
      },
      onError: (error) => {
        toast.error("Could not refresh currency rates.", {
          description: error instanceof Error ? error.message : "Unknown error.",
        });
      },
    }),
  );

  return {
    refreshRates: () => mutation.mutate({ baseCurrency: "USD" }),
    isRefreshing: mutation.isPending,
  };
}
