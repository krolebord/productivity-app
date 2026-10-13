import { ORPCError } from "@orpc/client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { AccountDialog } from "@/components/account-dialog";
import { AppDndProvider } from "@/components/app-dnd";
import { AppSidebar } from "@/components/app-sidebar";
import { AssistantSidebar } from "@/components/assistant/assistant-sidebar";
import {
  ConversationLastReadVisibilityWatcher,
  SubmitLockWatcher,
} from "@/components/assistant/conversation-activity-watcher";
import { CategoryImportanceDialog } from "@/components/category-importance-dialog";
import { CommandPalette } from "@/components/command-palette";
import { Devtools } from "@/components/devtools";
import { HabitDialog } from "@/components/habit-dialog";
import { NoteDialog } from "@/components/note-dialog";
import { OfflineBanner } from "@/components/offline-banner";
import { SyncStatusMonitor } from "@/components/sync-status-monitor";
import { TaskDialog } from "@/components/task-dialog";
import { TimeZoneWatcher } from "@/components/time-zone-watcher";
import { TodayPanel } from "@/components/today/today-panel";
import { TransactionDialog } from "@/components/transaction-dialog";
import { useAssistantStore } from "@/lib/assistant-store";
import { clearCachedAuth, readCachedAuth, writeCachedAuth } from "@/lib/auth-cache";
import { useIsAssistantPage } from "@/lib/use-assistant-surface";
import { useIsDesktop } from "@/lib/use-media-query";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { cn } from "@/lib/utils";
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

function RouteComponent() {
  const { db, auth } = Route.useLoaderData();
  const activePanel = useAssistantStore((s) => s.activePanel);
  const isDesktop = useIsDesktop();
  const assistantEnabled = auth.assistantEnabled;
  const resolvedPanel =
    activePanel === "assistant" && !assistantEnabled
      ? null
      : activePanel === "assistant" || activePanel === "today"
        ? activePanel
        : null;
  // The assistant page renders the same view full width, so the rail stands down
  // while it is up and the assistant never shows twice at once.
  const isAssistantPage = useIsAssistantPage();
  const showRightPanel = resolvedPanel !== null && isDesktop && !isAssistantPage;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "assistant-layout" });
  const shellRef = useVisualViewport<HTMLDivElement>();

  return (
    <DbProvider db={db}>
      {auth.assistantEnabled ? (
        <>
          <ConversationLastReadVisibilityWatcher />
          <SubmitLockWatcher />
        </>
      ) : null}
      <AppDndProvider>
        <SyncStatusMonitor />
        <TimeZoneWatcher />
        <div ref={shellRef} className="fixed inset-x-0 top-(--viewport-top) flex h-(--viewport-height) overflow-hidden">
          <OfflineBanner />
          <AppSidebar />
          <Group
            orientation="horizontal"
            className="min-w-0 flex-1"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
          >
            <Panel id="main" minSize="40%">
              {/* pb clears the mobile FABs so the last rows stay readable. The
                  assistant page hides them and fills the height itself. */}
              <main className={cn("h-full overflow-auto", !isAssistantPage && "pb-36 md:pb-0")}>
                <Outlet />
              </main>
            </Panel>
            {showRightPanel && resolvedPanel && (
              <>
                <Separator className="w-px bg-border transition-colors data-[separator=active]:bg-ring data-[separator=hover]:bg-ring" />
                <Panel id="assistant" defaultSize="400px" minSize="280px" maxSize="50%">
                  {resolvedPanel === "today" ? <TodayPanel /> : <AssistantSidebar />}
                </Panel>
              </>
            )}
          </Group>
        </div>
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
