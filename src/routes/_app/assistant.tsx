import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { AssistantSidebar } from "@/components/assistant/assistant-sidebar";
import { useAssistantNavigation } from "@/lib/use-assistant-navigation";
import { orpc } from "@/orpc/orpc-client";

export const Route = createFileRoute("/_app/assistant")({
  component: AssistantPage,
  loader: async ({ context }) => {
    const auth = await context.queryClient.ensureQueryData(orpc.auth.getAuth.queryOptions());
    if (!auth?.assistantEnabled) throw redirect({ to: "/" });
  },
});

function AssistantPage() {
  const { openPanel, closePanel } = useAssistantNavigation();

  // The page is the assistant's other surface, so the store still tracks it as
  // open: read receipts, the sidebar row and the hotkey all read that flag.
  useEffect(() => {
    openPanel("assistant");
    return () => closePanel();
  }, [openPanel, closePanel]);

  return (
    <div className="h-full">
      <AssistantSidebar />
    </div>
  );
}
