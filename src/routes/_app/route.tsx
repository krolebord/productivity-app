import { ORPCError } from "@orpc/client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useRef } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { AccountDialog } from "@/components/account-dialog";
import { AppDndProvider } from "@/components/app-dnd";
import { AppSidebar } from "@/components/app-sidebar";
import { AssistantSidebar } from "@/components/assistant/assistant-sidebar";
import { CategoryImportanceDialog } from "@/components/category-importance-dialog";
import { CommandPalette } from "@/components/command-palette";
import { Devtools } from "@/components/devtools";
import { HabitDialog } from "@/components/habit-dialog";
import { NoteDialog } from "@/components/note-dialog";
import { SyncStatusMonitor } from "@/components/sync-status-monitor";
import { TaskDialog } from "@/components/task-dialog";
import { LegacyTaskMigration } from "@/components/task-migration";
import { TodayPanel } from "@/components/today/today-panel";
import { TransactionDialog } from "@/components/transaction-dialog";
import { useAssistantStore } from "@/lib/assistant-store";
import { clearCachedAuth, readCachedAuth, writeCachedAuth } from "@/lib/auth-cache";
import { useIsDesktop } from "@/lib/use-media-query";
import { orpc } from "@/orpc/orpc-client";
import { DbProvider, initUserDb } from "@/user-db/user-db";

let cachedDb: { userId: string; db: Awaited<ReturnType<typeof initUserDb>> } | null = null;

export const Route = createFileRoute("/_app")({
  component: RouteComponent,
  shouldReload: false,
  loader: async ({ context }) => {
    let auth: ReturnType<typeof readCachedAuth>;
    try {
      const fetched = await context.queryClient.ensureQueryData(orpc.auth.getAuth.queryOptions());
      writeCachedAuth(fetched);
      auth = fetched;
    } catch (error) {
      // Only an explicit rejection means the session is gone. Anything else
      // (offline, server unreachable) boots from the last-known auth — the
      // data is local anyway, and sync will re-authenticate when it connects.
      if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
        clearCachedAuth();
        throw redirect({ to: "/sign-in" });
      }
      auth = readCachedAuth();
      if (!auth) throw error;
    }

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

function RightRailContent({ panel }: { panel: "assistant" | "today" }) {
  if (panel === "today") {
    return <TodayPanel />;
  }

  return <AssistantSidebar />;
}

function RouteComponent() {
  const { db, auth } = Route.useLoaderData();
  const activePanel = useAssistantStore((s) => s.activePanel);
  const isDesktop = useIsDesktop();
  const assistantEnabled = auth.assistantEnabled;
  // Assistant stays gated; Today is available to everyone. One right panel at a time.
  const resolvedPanel =
    activePanel === "assistant" && !assistantEnabled
      ? null
      : activePanel === "assistant" || activePanel === "today"
        ? activePanel
        : null;
  const mobileAssistantOpen = resolvedPanel === "assistant" && !isDesktop;
  const hasMountedMobileAssistant = useRef(false);
  if (mobileAssistantOpen) {
    hasMountedMobileAssistant.current = true;
  }
  const showRightPanel = resolvedPanel !== null && isDesktop;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "assistant-layout" });

  return (
    <DbProvider db={db}>
      <AppDndProvider>
        <SyncStatusMonitor />
        <LegacyTaskMigration />
        <div className="flex h-dvh overflow-hidden">
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
            {showRightPanel && resolvedPanel && (
              <>
                <Separator className="w-px bg-border transition-colors data-[separator=active]:bg-ring data-[separator=hover]:bg-ring" />
                <Panel id="assistant" defaultSize="400px" minSize="280px" maxSize="50%">
                  <RightRailContent panel={resolvedPanel} />
                </Panel>
              </>
            )}
          </Group>
        </div>
        {/* Keep the mobile assistant mounted after its first opening so closing it preserves chat state. */}
        {hasMountedMobileAssistant.current && !isDesktop && (
          <div
            className={mobileAssistantOpen ? "fixed inset-0 z-50 bg-background md:hidden" : "hidden"}
            aria-hidden={!mobileAssistantOpen}
            inert={!mobileAssistantOpen}
          >
            <RightRailContent panel="assistant" />
          </div>
        )}
        <CommandPalette />
        <NoteDialog />
        <TaskDialog />
        <AccountDialog />
        <HabitDialog />
        <TransactionDialog />
        <CategoryImportanceDialog />
        <Devtools />
      </AppDndProvider>
    </DbProvider>
  );
}
