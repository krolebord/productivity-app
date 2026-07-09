import type { DragEndEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatForDisplay } from "@tanstack/hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Link, useMatches, useNavigate, useRouter } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  Bot,
  Brain,
  CalendarCheck,
  ChevronDown,
  ChevronsUpDown,
  Coins,
  Home,
  Loader2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  PlusIcon,
  Repeat,
  Search,
  Sparkles,
  StickyNote,
  Sun,
  Wallet,
  Wifi,
  WifiOff,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useCreateAccount } from "@/components/account-dialog";
import { useCreateNote } from "@/components/note-dialog";
import { useCreateExpense, useCreateIncome, useCreateTransfer } from "@/components/transaction-dialog";
import { useAssistantStore } from "@/lib/assistant-store";
import { useAuth, useSignOut } from "@/lib/auth-client";
import { useCommandStore } from "@/lib/command-store";
import {
  NEW_ACCOUNT_HOTKEY,
  NEW_EXPENSE_HOTKEY,
  NEW_INCOME_HOTKEY,
  NEW_NOTE_HOTKEY,
  NEW_TRANSFER_HOTKEY,
  OPEN_COMMAND_HOTKEY,
  TOGGLE_ASSISTANT_HOTKEY,
  TOGGLE_SIDEBAR_HOTKEY,
} from "@/lib/hotkeys";
import { useSidebarStore } from "@/lib/sidebar-store";
import { type Theme, useThemeStore } from "@/lib/theme-store";
import { useAssistantEnabled } from "@/lib/use-assistant-enabled";
import { useAttachToAssistant } from "@/lib/use-attach-to-assistant";
import { cn } from "@/lib/utils";
import { useDb, useDbQuery, useDbState } from "@/user-db/user-db";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Separator } from "./ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/today", label: "Today", icon: CalendarCheck },
  { to: "/notes", label: "Notes", icon: StickyNote },
  { to: "/habits", label: "Habits", icon: Repeat },
] as const;

const agentNavItems = [
  { to: "/memories", label: "Memories", icon: Brain },
  { to: "/skills", label: "Skills", icon: Workflow },
] as const;

const remoteStateConfig = {
  online: { label: "Online", icon: <Wifi className="size-4" />, className: "text-emerald-500" },
  pending: { label: "Connecting", icon: <Loader2 className="size-4 animate-spin" />, className: "text-amber-500" },
  offline: { label: "Offline", icon: <WifiOff className="size-4" />, className: "text-rose-500" },
} as const;

function RemoteStateIndicator() {
  const { state } = useDb();
  const { remoteState } = useDbState();
  const status = remoteStateConfig[remoteState ?? "offline"];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", status.className)}
          aria-label={`Sync status: ${status.label}`}
          onClick={() => (remoteState === "online" ? state.goOffline() : state.goOnline())}
        >
          {status.icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {status.label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarTooltip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  if (!collapsed) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarNavLink({
  to,
  label,
  icon: Icon,
  isActive,
  collapsed,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <SidebarTooltip label={label} collapsed={collapsed}>
      <Link
        to={to}
        onClick={onNavigate}
        viewTransition
        className={cn(
          "flex items-center rounded-md font-medium text-sm transition-colors",
          collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && label}
      </Link>
    </SidebarTooltip>
  );
}

function TodayToggle({ collapsed }: { collapsed: boolean }) {
  const activePanel = useAssistantStore((s) => s.activePanel);
  const togglePanel = useAssistantStore((s) => s.togglePanel);
  const open = activePanel === "today";

  return (
    <SidebarTooltip label="Today" collapsed={collapsed}>
      <Button
        type="button"
        variant="ghost"
        size={collapsed ? "icon" : "sm"}
        className={cn(!collapsed && "w-full justify-start gap-2", open && "text-primary")}
        onClick={() => togglePanel("today")}
        aria-label={open ? "Close today panel" : "Open today panel"}
      >
        <CalendarCheck className="size-4" />
        {!collapsed && <span className="flex-1 text-left">Today</span>}
      </Button>
    </SidebarTooltip>
  );
}

function AssistantToggle({ collapsed }: { collapsed: boolean }) {
  const activePanel = useAssistantStore((s) => s.activePanel);
  const togglePanel = useAssistantStore((s) => s.togglePanel);
  const assistantEnabled = useAssistantEnabled();
  const open = activePanel === "assistant";

  if (!assistantEnabled) {
    return null;
  }

  return (
    <SidebarTooltip label={`Assistant (${formatForDisplay(TOGGLE_ASSISTANT_HOTKEY)})`} collapsed={collapsed}>
      <Button
        type="button"
        variant="ghost"
        size={collapsed ? "icon" : "sm"}
        className={cn(!collapsed && "w-full justify-start gap-2", open && "text-primary")}
        onClick={() => togglePanel("assistant")}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-keyshortcuts={TOGGLE_ASSISTANT_HOTKEY}
      >
        <Sparkles className="size-4" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Assistant</span>
            <kbd className="pointer-events-none hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline">
              {formatForDisplay(TOGGLE_ASSISTANT_HOTKEY)}
            </kbd>
          </>
        )}
      </Button>
    </SidebarTooltip>
  );
}

function SidebarActionRow({ collapsed }: { collapsed: boolean }) {
  const openCommand = useCommandStore((s) => s.open);
  const createNote = useCreateNote();
  const createExpense = useCreateExpense();
  const createIncome = useCreateIncome();
  const createTransfer = useCreateTransfer();
  const createAccount = useCreateAccount();

  const menuContent = (
    <DropdownMenuContent side={collapsed ? "right" : "bottom"} align="start" className="w-56">
      <DropdownMenuItem onClick={createNote}>
        <StickyNote className="size-4" />
        New note
        <DropdownMenuShortcut>{formatForDisplay(NEW_NOTE_HOTKEY)}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={createExpense}>
        <ArrowDownLeftIcon className="size-4 text-red-500" />
        New expense
        <DropdownMenuShortcut>{formatForDisplay(NEW_EXPENSE_HOTKEY)}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={createIncome}>
        <ArrowUpRightIcon className="size-4 text-emerald-500" />
        New income
        <DropdownMenuShortcut>{formatForDisplay(NEW_INCOME_HOTKEY)}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={createTransfer}>
        <ArrowLeftRightIcon className="size-4 text-blue-500" />
        New transfer
        <DropdownMenuShortcut>{formatForDisplay(NEW_TRANSFER_HOTKEY)}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={createAccount}>
        <Wallet className="size-4" />
        New account
        <DropdownMenuShortcut>{formatForDisplay(NEW_ACCOUNT_HOTKEY)}</DropdownMenuShortcut>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const searchLabel = `Search (${formatForDisplay(OPEN_COMMAND_HOTKEY)})`;

  if (collapsed) {
    return (
      <div className="hidden flex-col items-center gap-1 p-2 md:flex">
        <DropdownMenu>
          <SidebarTooltip label="New" collapsed>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" aria-label="New">
                <PlusIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </SidebarTooltip>
          {menuContent}
        </DropdownMenu>
        <SidebarTooltip label={searchLabel} collapsed>
          <Button
            type="button"
            variant="tinted"
            size="icon"
            onClick={openCommand}
            aria-label="Search"
            aria-keyshortcuts={OPEN_COMMAND_HOTKEY}
          >
            <Search className="size-4" />
          </Button>
        </SidebarTooltip>
      </div>
    );
  }

  return (
    <div className="hidden gap-1.5 p-2 md:flex">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon-sm" aria-label="New">
            <PlusIcon className="size-4 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        {menuContent}
      </DropdownMenu>
      <Button
        type="button"
        variant="tinted"
        size="sm"
        className="flex-1 justify-start gap-2"
        onClick={openCommand}
        aria-label="Search"
        aria-keyshortcuts={OPEN_COMMAND_HOTKEY}
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="pointer-events-none hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline">
          {formatForDisplay(OPEN_COMMAND_HOTKEY)}
        </kbd>
      </Button>
    </div>
  );
}

function SidebarContent({
  collapsed = false,
  onToggleCollapse,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  const auth = useAuth();
  const logout = useSignOut();
  const matches = useMatches();
  const currentPath = matches[matches.length - 1]?.fullPath;
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <>
      <div className={cn("flex items-center", collapsed ? "flex-col gap-1 px-2 py-3" : "h-14 justify-between px-4")}>
        <SidebarTooltip label="Productivity" collapsed={collapsed}>
          <Link
            to="/"
            viewTransition
            className={cn(
              "font-semibold tracking-tight",
              collapsed ? "flex size-8 items-center justify-center rounded-md bg-sidebar-accent text-sm" : "text-base",
            )}
          >
            {collapsed ? "P" : "Productivity"}
          </Link>
        </SidebarTooltip>
        <RemoteStateIndicator />
      </div>

      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <SidebarActionRow collapsed={collapsed} />

        <nav className="flex flex-col gap-1 p-2">
          {navItems.map((item) => (
            <SidebarNavLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              isActive={currentPath === item.to}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
          <AccountsNavItem currentPath={currentPath} collapsed={collapsed} onNavigate={onNavigate} />
          <SidebarNavLink
            to="/currencies"
            label="Currencies"
            icon={Coins}
            isActive={currentPath === "/currencies"}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <SidebarNavLink
            to="/integrations"
            label="Integrations"
            icon={Plug}
            isActive={currentPath === "/integrations"}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <AgentsNavItem currentPath={currentPath} collapsed={collapsed} onNavigate={onNavigate} />
        </nav>
      </div>

      <Separator />

      <div className={cn("flex p-2", collapsed ? "flex-col items-center gap-1" : "flex-col gap-1")}>
        {onToggleCollapse && (
          <>
            <TodayToggle collapsed={collapsed} />
            <AssistantToggle collapsed={collapsed} />
            <SidebarTooltip
              label={
                collapsed
                  ? `Expand sidebar (${formatForDisplay(TOGGLE_SIDEBAR_HOTKEY)})`
                  : `Collapse sidebar (${formatForDisplay(TOGGLE_SIDEBAR_HOTKEY)})`
              }
              collapsed={collapsed}
            >
              <Button
                type="button"
                variant="ghost"
                size={collapsed ? "icon" : "sm"}
                className={cn(!collapsed && "w-full justify-start gap-2")}
                onClick={onToggleCollapse}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-keyshortcuts={TOGGLE_SIDEBAR_HOTKEY}
              >
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">Collapse</span>
                    <kbd className="pointer-events-none hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline">
                      {formatForDisplay(TOGGLE_SIDEBAR_HOTKEY)}
                    </kbd>
                  </>
                )}
              </Button>
            </SidebarTooltip>
          </>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center rounded-md transition-colors hover:bg-sidebar-accent",
              collapsed ? "justify-center p-2" : "w-full gap-2 p-3 text-left",
            )}
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="text-xs">{auth.userName.slice(0, 2)}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-sm">{auth.userName}</span>
                  <span className="truncate text-muted-foreground text-xs">{auth.userEmail}</span>
                </div>
                <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/50" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={collapsed ? "right" : "top"} align="start" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{auth.userName.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-sm">{auth.userName}</span>
                <span className="truncate text-muted-foreground text-xs">{auth.userEmail}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-xs">Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
            <DropdownMenuRadioItem value="light">
              <Sun className="size-4" />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="size-4" />
              Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="size-4" />
              System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} disabled={logout.isPending}>
            <LogOut className="size-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function formatCompactBalance(balance: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(balance);
  } catch {
    return `${currency} ${balance.toFixed(0)}`;
  }
}

type AccountRow = {
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
  account: AccountRow;
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
                navigate({ to: "/transactions", search: { accountId: account.id }, viewTransition: true });
                onNavigate?.();
              }
            }
      }
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70",
        sortable.isDragging && "opacity-50",
        isContextKeyHeld && "cursor-copy",
      )}
    >
      <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: account.labelColor }} />
      <span className="flex-1 truncate text-left">{account.labelText || "Untitled"}</span>
      <span className="font-mono text-muted-foreground text-xs tabular-nums">
        {formatCompactBalance(account.balance, account.currency)}
      </span>
    </button>
  );
}

function AccountsNavItem({
  currentPath,
  collapsed,
  onNavigate,
}: {
  currentPath: string | undefined;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const db = useDb();
  const { data: accounts } = useDbQuery((db) => db.selectFrom("account").selectAll().orderBy("order", "asc"));

  const groupOpen = useSidebarStore((s) => s.groups.accounts);
  const setGroupOpen = useSidebarStore((s) => s.setGroupOpen);

  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  const activeAccountId =
    lastMatch?.fullPath === "/transactions" ? (lastMatch.search as { accountId?: string }).accountId : undefined;

  const isAccountsPageActive = currentPath === "/accounts";
  const isActive = currentPath === "/transactions" || isAccountsPageActive;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldOrder = over.data.current?.order;
    const newOrder = active.data.current?.order;
    if (oldOrder === undefined || newOrder === undefined) return;

    db.db.executeTransaction((trx) => {
      trx.executeKysely((q) =>
        q
          .updateTable("account")
          .set({ order: oldOrder })
          .where("id", "=", active.id as string),
      );
      trx.executeKysely((q) =>
        q
          .updateTable("account")
          .set({ order: newOrder })
          .where("id", "=", over.id as string),
      );
    });
  }

  if (collapsed) {
    return (
      <SidebarNavLink
        to="/transactions"
        label="Accounts"
        icon={Wallet}
        isActive={isActive}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <Collapsible open={groupOpen ?? accounts.length > 0} onOpenChange={(open) => setGroupOpen("accounts", open)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md font-medium text-sm transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        )}
      >
        <Link
          to="/transactions"
          viewTransition
          onClick={onNavigate}
          className="flex flex-1 items-center gap-2 px-3 py-2"
        >
          <Wallet className="size-4 shrink-0" />
          Accounts
        </Link>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="mr-2 rounded-sm p-0.5 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Toggle accounts list"
          >
            <ChevronDown className="size-3.5 transition-transform [[data-state=closed]_&]:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={accounts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="mt-0.5 ml-4 flex flex-col gap-0.5 border-sidebar-border/50 border-l pl-3">
              {accounts.map((account) => (
                <SortableAccountRow
                  key={account.id}
                  account={account}
                  isActive={activeAccountId === account.id}
                  onNavigate={onNavigate}
                />
              ))}
              <Link
                to="/accounts"
                viewTransition
                onClick={onNavigate}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                  isAccountsPageActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70",
                )}
              >
                <span className="flex-1 truncate text-left">All accounts</span>
              </Link>
            </div>
          </SortableContext>
        </DndContext>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AgentsNavItem({
  currentPath,
  collapsed,
  onNavigate,
}: {
  currentPath: string | undefined;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const isActive = currentPath === "/agents" || agentNavItems.some((item) => currentPath === item.to);

  const groupOpen = useSidebarStore((s) => s.groups.agents);
  const setGroupOpen = useSidebarStore((s) => s.setGroupOpen);

  if (collapsed) {
    return (
      <SidebarNavLink
        to="/agents"
        label="Agents"
        icon={Bot}
        isActive={isActive}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <Collapsible open={groupOpen ?? true} onOpenChange={(open) => setGroupOpen("agents", open)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md font-medium text-sm transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        )}
      >
        <Link to="/agents" viewTransition onClick={onNavigate} className="flex flex-1 items-center gap-2 px-3 py-2">
          <Bot className="size-4 shrink-0" />
          Agents
        </Link>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="mr-2 rounded-sm p-0.5 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Toggle agents list"
          >
            <ChevronDown className="size-3.5 transition-transform [[data-state=closed]_&]:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-0.5 ml-4 flex flex-col gap-0.5 border-sidebar-border/50 border-l pl-3">
          {agentNavItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              viewTransition
              onClick={onNavigate}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                currentPath === item.to
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70",
              )}
            >
              <item.icon className="size-3.5 shrink-0" />
              <span className="flex-1 truncate text-left">{item.label}</span>
            </Link>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Close sheet on route change (e.g. back/forward navigation)
  useEffect(() => {
    return router.subscribe("onBeforeNavigate", () => setOpen(false));
  }, [router]);

  const openCommand = useCommandStore((s) => s.open);
  const togglePanel = useAssistantStore((s) => s.togglePanel);
  const assistantEnabled = useAssistantEnabled();

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="!rounded-full fixed bottom-4 left-4 z-40 size-11 shadow-lg md:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="bg-sidebar text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>App navigation</SheetDescription>
          </SheetHeader>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <Button
        variant="secondary"
        size="icon"
        className={cn(
          "!rounded-full fixed right-4 z-40 size-11 shadow-lg md:hidden",
          assistantEnabled ? "bottom-[8.5rem]" : "bottom-[4.75rem]",
        )}
        aria-label="Open today panel"
        onClick={() => togglePanel("today")}
      >
        <CalendarCheck className="size-5" />
      </Button>

      {assistantEnabled && (
        <Button
          variant="secondary"
          size="icon"
          className="!rounded-full fixed right-4 bottom-[4.75rem] z-40 size-11 shadow-lg md:hidden"
          aria-label="Open assistant"
          onClick={() => togglePanel("assistant")}
        >
          <Sparkles className="size-5" />
        </Button>
      )}

      <Button
        variant="default"
        size="icon"
        className="!rounded-full fixed right-4 bottom-4 z-40 size-11 shadow-lg md:hidden"
        aria-label="Open command palette"
        onClick={openCommand}
      >
        <PlusIcon className="size-5" />
      </Button>
    </>
  );
}

export function AppSidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const togglePanel = useAssistantStore((s) => s.togglePanel);
  const assistantEnabled = useAssistantEnabled();

  useHotkey(TOGGLE_SIDEBAR_HOTKEY, (e) => {
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    e.preventDefault();
    toggle();
  });

  useHotkey(
    TOGGLE_ASSISTANT_HOTKEY,
    (e) => {
      if (!window.matchMedia("(min-width: 768px)").matches) return;
      e.preventDefault();
      togglePanel("assistant");
    },
    { enabled: assistantEnabled },
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={toggle} />
      </aside>

      {/* Mobile sheet trigger + sheet */}
      <MobileSidebar />
    </>
  );
}
