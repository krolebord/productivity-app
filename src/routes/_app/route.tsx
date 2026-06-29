import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { AccountDialog } from "@/components/account-dialog";
import { AppSidebar } from "@/components/app-sidebar";
import { AssistantSidebar } from "@/components/assistant/assistant-sidebar";
import { CategoryImportanceDialog } from "@/components/category-importance-dialog";
import { CommandPalette } from "@/components/command-palette";
import { Devtools } from "@/components/devtools";
import { NoteDialog } from "@/components/note-dialog";
import { SyncStatusMonitor } from "@/components/sync-status-monitor";
import { TransactionDialog } from "@/components/transaction-dialog";
import { useAssistantStore } from "@/lib/assistant-store";
import { useIsDesktop } from "@/lib/use-media-query";
import { orpc } from "@/orpc/orpc-client";
import { DbProvider, initUserDb } from "@/user-db/user-db";

let cachedDb: { userId: string; db: Awaited<ReturnType<typeof initUserDb>> } | null = null;

export const Route = createFileRoute("/_app")({
  component: RouteComponent,
  shouldReload: false,
  loader: async ({ context }) => {
    const auth = await context.queryClient.ensureQueryData(orpc.auth.getAuth.queryOptions());

    if (!auth) {
      throw redirect({ to: "/sign-in" });
    }

    if (!cachedDb || cachedDb.userId !== auth.userId) {
      const db = await initUserDb({ userId: auth.userId });
      cachedDb = { userId: auth.userId, db };
    }

    return { auth, db: cachedDb.db };
  },
  staleTime: 1000 * 60 * 5,
});

function RouteComponent() {
  const { db, auth } = Route.useLoaderData();
  const assistantOpen = useAssistantStore((s) => s.open);
  const isDesktop = useIsDesktop();
  const assistantEnabled = auth.assistantEnabled;
  const showAssistant = assistantEnabled && assistantOpen && isDesktop;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "assistant-layout" });

  return (
    <DbProvider db={db}>
      <SyncStatusMonitor />
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <Group
          orientation="horizontal"
          className="min-w-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="main" minSize="40%">
            <main className="h-full overflow-auto">
              <Outlet />
            </main>
          </Panel>
          {showAssistant && (
            <>
              <Separator className="w-px bg-border transition-colors data-[separator=active]:bg-ring data-[separator=hover]:bg-ring" />
              <Panel id="assistant" defaultSize="400px" minSize="280px" maxSize="50%">
                {/* useAgentChat suspends while fetching history — keep that contained to the panel */}
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center bg-background">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <AssistantSidebar />
                </Suspense>
              </Panel>
            </>
          )}
        </Group>
      </div>
      {/* Mobile: the assistant fills the screen instead of docking in a panel. Its header X closes it. */}
      {assistantEnabled && assistantOpen && !isDesktop && (
        <div className="fixed inset-0 z-50 bg-background md:hidden">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center bg-background">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <AssistantSidebar />
          </Suspense>
        </div>
      )}
      <CommandPalette />
      <NoteDialog />
      <AccountDialog />
      <TransactionDialog />
      <CategoryImportanceDialog />
      <Devtools />
    </DbProvider>
  );
}
