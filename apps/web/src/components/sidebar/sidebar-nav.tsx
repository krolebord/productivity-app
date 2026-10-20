import { closestCenter, DndContext, KeyboardSensor, MouseSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatCompactBalance } from "@productivity/core/currency/format";
import { useIntegrationsHasError } from "@productivity/core/data/integrations";
import { useNoteViews } from "@productivity/core/data/note-views";
import { type NoteViewSearch, noteViewSearch, viewMatchesSearch } from "@productivity/core/note-views";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Bot, Brain, ChartPie, Plug, Repeat, StickyNote, Workflow } from "lucide-react";
import { AccountDot } from "@/components/account-row";
import {
  SidebarNavGroup,
  SidebarNavLink,
  SidebarSubLink,
  SidebarSubRowMarker,
  sidebarSubRowClass,
} from "@/components/sidebar/sidebar-primitives";
import { useReorderableAccounts } from "@/lib/finance/accounts";
import { useAttachToAssistant } from "@/lib/use-attach-to-assistant";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * The sidebar's destinations, in the order they appear. Groups own their own
 * data (accounts, note views, agent pages) but read the active route from the
 * one location hook below, so no entry invents its own rule.
 */

type NavEntryProps = {
  collapsed: boolean;
  onNavigate?: () => void;
};

/** Single source for "where are we", including the bits of search state nav rows care about. */
export function useSidebarLocation() {
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  const path = lastMatch?.fullPath;
  const search = (lastMatch?.search ?? {}) as Record<string, unknown>;

  return {
    path,
    isPath: (to: string) => path === to,
    isUnder: (prefix: string) => path?.startsWith(prefix) ?? false,
    /** Set only while viewing one account's ledger. */
    accountId: path === "/finances/transactions" ? (search.accountId as string | undefined) : undefined,
    notesSearch: path === "/notes" ? (search as NoteViewSearch) : undefined,
  };
}

type SidebarAccount = {
  id: string;
  labelColor: string;
  labelText: string;
  balance: number;
  currency: string;
  order: number;
};

function AccountNavRow({
  account,
  isActive,
  onNavigate,
  sortable,
}: {
  account: SidebarAccount;
  isActive: boolean;
  onNavigate?: () => void;
  sortable?: ReturnType<typeof useSortable>;
}) {
  const navigate = useNavigate();
  const { isContextKeyHeld, getAttachClickHandler } = useAttachToAssistant();
  const attachRef = { table: "account", id: account.id } as const;

  return (
    <button
      type="button"
      ref={sortable?.setNodeRef}
      style={
        sortable
          ? {
              transform: CSS.Translate.toString(sortable.transform),
              transition: sortable.transition,
            }
          : undefined
      }
      {...sortable?.attributes}
      {...sortable?.listeners}
      onClick={
        isContextKeyHeld
          ? getAttachClickHandler(attachRef)
          : () => {
              if (!sortable?.isDragging) {
                navigate({ to: "/finances/transactions", search: { accountId: account.id }, viewTransition: true });
                onNavigate?.();
              }
            }
      }
      className={cn(
        sidebarSubRowClass({ isActive }),
        sortable?.isDragging && "opacity-50",
        isContextKeyHeld && "cursor-copy",
      )}
    >
      <SidebarSubRowMarker>
        <AccountDot color={account.labelColor} />
      </SidebarSubRowMarker>
      <span className="flex-1 truncate text-left">{account.labelText || "Untitled"}</span>
      <span className="font-mono text-muted-foreground text-xs tabular-nums">
        {formatCompactBalance(account.balance, account.currency)}
      </span>
    </button>
  );
}

function SortableAccountRow({
  account,
  isActive,
  onNavigate,
}: {
  account: SidebarAccount;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const sortable = useSortable({ id: account.id, data: { order: account.order } });
  return <AccountNavRow account={account} isActive={isActive} onNavigate={onNavigate} sortable={sortable} />;
}

function ReorderableAccountList({
  accounts,
  activeAccountId,
  onNavigate,
  onDragEnd,
}: {
  accounts: SidebarAccount[];
  activeAccountId: string | undefined;
  onNavigate?: () => void;
  onDragEnd: ReturnType<typeof useReorderableAccounts>["handleDragEnd"];
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={accounts.map((account) => account.id)} strategy={verticalListSortingStrategy}>
        {accounts.map((account) => (
          <SortableAccountRow
            key={account.id}
            account={account}
            isActive={activeAccountId === account.id}
            onNavigate={onNavigate}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

/** Finances owns the accounts list: accounts are part of this section, not a sibling of it. */
function FinancesNavItem({ collapsed, onNavigate }: NavEntryProps) {
  const location = useSidebarLocation();
  const isDesktop = useIsDesktop();
  const { accounts, handleDragEnd } = useReorderableAccounts();

  return (
    <SidebarNavGroup
      groupKey="finances"
      target={{ to: "/finances" }}
      label="Finances"
      icon={ChartPie}
      isActive={location.isUnder("/finances")}
      collapsed={collapsed}
      onNavigate={onNavigate}
    >
      {/* The whole ledger first, then the accounts that narrow it down. */}
      <SidebarSubLink
        target={{ to: "/finances/transactions" }}
        label="Transactions"
        isActive={location.isPath("/finances/transactions") && !location.accountId}
        marker={<ArrowLeftRight className="size-3.5" />}
        onNavigate={onNavigate}
      />
      {isDesktop ? (
        <ReorderableAccountList
          accounts={accounts}
          activeAccountId={location.accountId}
          onNavigate={onNavigate}
          onDragEnd={handleDragEnd}
        />
      ) : (
        accounts.map((account) => (
          <AccountNavRow
            key={account.id}
            account={account}
            isActive={location.accountId === account.id}
            onNavigate={onNavigate}
          />
        ))
      )}
    </SidebarNavGroup>
  );
}

function NotesNavItem({ collapsed, onNavigate }: NavEntryProps) {
  const location = useSidebarLocation();
  const views = useNoteViews();

  const isActive = location.isPath("/notes");

  if (views.length === 0) {
    return (
      <SidebarNavLink
        target={{ to: "/notes" }}
        label="Notes"
        icon={StickyNote}
        isActive={isActive}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
    );
  }

  const activeViewId = location.notesSearch
    ? views.find((view) => viewMatchesSearch(view, location.notesSearch as NoteViewSearch))?.id
    : undefined;

  return (
    <SidebarNavGroup
      groupKey="notes"
      target={{ to: "/notes" }}
      label="Notes"
      icon={StickyNote}
      isActive={isActive}
      collapsed={collapsed}
      onNavigate={onNavigate}
    >
      {views.map((view) => (
        <SidebarSubLink
          key={view.id}
          target={{ to: "/notes", search: noteViewSearch(view) }}
          label={view.name || "Untitled"}
          isActive={activeViewId === view.id}
          onNavigate={onNavigate}
        />
      ))}
    </SidebarNavGroup>
  );
}

const AGENT_PAGES = [
  { to: "/memories", label: "Memories", icon: Brain },
  { to: "/skills", label: "Skills", icon: Workflow },
] as const;

function AgentsNavItem({ collapsed, onNavigate }: NavEntryProps) {
  const location = useSidebarLocation();
  const isActive = location.isPath("/agents") || AGENT_PAGES.some((page) => location.isPath(page.to));

  return (
    <SidebarNavGroup
      groupKey="agents"
      target={{ to: "/agents" }}
      label="Agents"
      icon={Bot}
      isActive={isActive}
      collapsed={collapsed}
      onNavigate={onNavigate}
    >
      {AGENT_PAGES.map((page) => (
        <SidebarSubLink
          key={page.to}
          target={{ to: page.to }}
          label={page.label}
          isActive={location.isPath(page.to)}
          marker={<page.icon className="size-3.5" />}
          onNavigate={onNavigate}
        />
      ))}
    </SidebarNavGroup>
  );
}

function IntegrationsNavItem({ collapsed, onNavigate }: NavEntryProps) {
  const location = useSidebarLocation();
  const hasError = useIntegrationsHasError();

  return (
    <SidebarNavLink
      target={{ to: "/integrations" }}
      label="Integrations"
      icon={Plug}
      isActive={location.isPath("/integrations")}
      collapsed={collapsed}
      hasError={hasError}
      onNavigate={onNavigate}
    />
  );
}

/** Sidebar order lives here — one list, top to bottom, no interleaved JSX. */
const NAV_ENTRIES = [
  { kind: "group", key: "finances", component: FinancesNavItem },
  { kind: "group", key: "notes", component: NotesNavItem },
  { kind: "link", key: "habits", to: "/habits", label: "Habits", icon: Repeat },
  { kind: "group", key: "agents", component: AgentsNavItem },
  { kind: "group", key: "integrations", component: IntegrationsNavItem },
] as const;

export function SidebarNav({ collapsed, onNavigate }: NavEntryProps) {
  const location = useSidebarLocation();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-2">
      {NAV_ENTRIES.map((entry) => {
        if (entry.kind === "group") {
          return <entry.component key={entry.key} collapsed={collapsed} onNavigate={onNavigate} />;
        }

        return (
          <SidebarNavLink
            key={entry.key}
            target={{ to: entry.to }}
            label={entry.label}
            icon={entry.icon}
            isActive={location.isPath(entry.to)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        );
      })}
    </nav>
  );
}
