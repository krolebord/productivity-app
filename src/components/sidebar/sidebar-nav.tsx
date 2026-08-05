import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { formatCompactBalance } from "@/lib/currency/format";
import { useReorderableAccounts } from "@/lib/finance/accounts";
import { type NoteViewSearch, noteViewSearch, viewMatchesSearch } from "@/lib/note-views";
import { useAttachToAssistant } from "@/lib/use-attach-to-assistant";
import { cn } from "@/lib/utils";
import { useDbQuery } from "@/user-db/user-db";

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
  const navigate = useNavigate();
  const { isContextKeyHeld, getAttachClickHandler } = useAttachToAssistant();
  const attachRef = { table: "account", id: account.id } as const;

  return (
    <button
      type="button"
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      {...sortable.attributes}
      {...sortable.listeners}
      onClick={
        isContextKeyHeld
          ? getAttachClickHandler(attachRef)
          : () => {
              if (!sortable.isDragging) {
                navigate({ to: "/finances/transactions", search: { accountId: account.id }, viewTransition: true });
                onNavigate?.();
              }
            }
      }
      className={cn(
        sidebarSubRowClass({ isActive }),
        sortable.isDragging && "opacity-50",
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

/** Finances owns the accounts list: accounts are part of this section, not a sibling of it. */
function FinancesNavItem({ collapsed, onNavigate }: NavEntryProps) {
  const location = useSidebarLocation();
  const { accounts, handleDragEnd } = useReorderableAccounts();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={accounts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {accounts.map((account) => (
            <SortableAccountRow
              key={account.id}
              account={account}
              isActive={location.accountId === account.id}
              onNavigate={onNavigate}
            />
          ))}
        </SortableContext>
      </DndContext>
    </SidebarNavGroup>
  );
}

function NotesNavItem({ collapsed, onNavigate }: NavEntryProps) {
  const location = useSidebarLocation();
  const { data: views } = useDbQuery((db) =>
    db.selectFrom("note_view").selectAll().orderBy("order", "asc").orderBy("createdAt", "asc"),
  );

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

/** Sidebar order lives here — one list, top to bottom, no interleaved JSX. */
const NAV_ENTRIES = [
  { kind: "group", key: "finances", component: FinancesNavItem },
  { kind: "group", key: "notes", component: NotesNavItem },
  { kind: "link", key: "habits", to: "/habits", label: "Habits", icon: Repeat },
  { kind: "group", key: "agents", component: AgentsNavItem },
  { kind: "link", key: "integrations", to: "/integrations", label: "Integrations", icon: Plug },
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
