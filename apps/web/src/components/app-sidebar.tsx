import { useIntegrationsHasError } from "@productivity/core/data/integrations";
import { useDb, useDbState } from "@productivity/core/user-db/db-context";
import { formatForDisplay } from "@tanstack/hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  CalendarCheck,
  ChartPie,
  ChevronsUpDown,
  Database,
  Globe,
  ListTodoIcon,
  Loader2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlusIcon,
  Search,
  Sparkles,
  StickyNote,
  Sun,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useCreateAccount } from "@/components/account-dialog";
import { useDevtoolsStore } from "@/components/devtools";
import { useCreateNote } from "@/components/note-dialog";
import { SidebarNav, useSidebarLocation } from "@/components/sidebar/sidebar-nav";
import { SidebarPanel, SidebarTooltip } from "@/components/sidebar/sidebar-primitives";
import { useCreateTask } from "@/components/task-dialog";
import { useCreateExpense, useCreateIncome, useCreateTransfer } from "@/components/transaction-dialog";
import { useAssistantStore } from "@/lib/assistant-store";
import { useAuth, useSignOut } from "@/lib/auth-client";
import { useCommandStore } from "@/lib/command-store";
import { useDashboardSettings } from "@/lib/dashboard-settings";
import { type DefaultHome, useDefaultHomeStore } from "@/lib/default-home-store";
import { TRANSACTION_TYPE_STYLE } from "@/lib/finance-ui";
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
import { useAssistantNavigation } from "@/lib/use-assistant-navigation";
import { useAssistantSurface } from "@/lib/use-assistant-surface";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button, buttonVariants } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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

const remoteStateConfig = {
  online: { label: "Online", icon: <Wifi className="size-4" />, className: "text-emerald-500" },
  connecting: { label: "Connecting", icon: <Loader2 className="size-4 animate-spin" />, className: "text-amber-500" },
  offline: { label: "Offline", icon: <WifiOff className="size-4" />, className: "text-rose-500" },
} as const;

function RemoteStateIndicator() {
  const { state } = useDb();
  const { remoteState } = useDbState();
  const status = remoteStateConfig[remoteState ?? "offline"];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", status.className)}
            aria-label={`Sync status: ${status.label}`}
            onClick={() => (remoteState === "online" ? state.goOffline() : state.goOnline())}
          />
        }
      >
        {status.icon}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {status.label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarActionRow({ collapsed }: { collapsed: boolean }) {
  const openCommand = useCommandStore((s) => s.open);
  const createNote = useCreateNote();
  const createTask = useCreateTask();
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
      <DropdownMenuItem onClick={createTask}>
        <ListTodoIcon className="size-4" />
        New task
      </DropdownMenuItem>
      <DropdownMenuItem onClick={createExpense}>
        <ArrowDownLeftIcon className={cn("size-4", TRANSACTION_TYPE_STYLE.expense.accent)} />
        New expense
        <DropdownMenuShortcut>{formatForDisplay(NEW_EXPENSE_HOTKEY)}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={createIncome}>
        <ArrowUpRightIcon className={cn("size-4", TRANSACTION_TYPE_STYLE.income.accent)} />
        New income
        <DropdownMenuShortcut>{formatForDisplay(NEW_INCOME_HOTKEY)}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={createTransfer}>
        <ArrowLeftRightIcon className={cn("size-4", TRANSACTION_TYPE_STYLE.transfer.accent)} />
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
            <DropdownMenuTrigger render={<Button type="button" size="icon" aria-label="New" />}>
              <PlusIcon className="size-4" />
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
        <DropdownMenuTrigger render={<Button type="button" size="icon-sm" aria-label="New" />}>
          <PlusIcon className="size-4 shrink-0" />
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

/**
 * Today and the assistant are overlay panels, not destinations, so they sit
 * together above the nav list instead of being split between it and the footer.
 * On mobile there is no room for a side panel, so both are pages there.
 */
function SidebarPanelRow({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const isDesktop = useIsDesktop();
  const location = useSidebarLocation();
  const activePanel = useAssistantStore((s) => s.activePanel);
  const { togglePanel } = useAssistantNavigation();
  const assistantEnabled = useAssistantEnabled();

  return (
    <div className={cn("flex gap-1 p-2", collapsed ? "flex-col items-center" : "flex-row")}>
      {isDesktop ? (
        <SidebarPanel
          icon={CalendarCheck}
          label="Today"
          isOpen={activePanel === "today" || location.isPath("/today")}
          collapsed={collapsed}
          onToggle={() => togglePanel("today")}
        />
      ) : (
        <SidebarPanel
          icon={CalendarCheck}
          label="Today"
          isOpen={location.isPath("/today")}
          collapsed={collapsed}
          target={{ to: "/today" }}
          onNavigate={onNavigate}
        />
      )}
      {assistantEnabled &&
        (isDesktop ? (
          <SidebarPanel
            icon={Sparkles}
            label="Assistant"
            isOpen={activePanel === "assistant" || location.isPath("/assistant")}
            collapsed={collapsed}
            hotkey={TOGGLE_ASSISTANT_HOTKEY}
            onToggle={() => {
              togglePanel("assistant");
              onNavigate?.();
            }}
          />
        ) : (
          <SidebarPanel
            icon={Sparkles}
            label="Assistant"
            isOpen={location.isPath("/assistant")}
            collapsed={collapsed}
            target={{ to: "/assistant" }}
            onNavigate={onNavigate}
          />
        ))}
    </div>
  );
}

function SidebarUserMenu({ collapsed }: { collapsed: boolean }) {
  const auth = useAuth();
  const logout = useSignOut();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const defaultHome = useDefaultHomeStore((s) => s.defaultHome);
  const setDefaultHome = useDefaultHomeStore((s) => s.setDefaultHome);
  const { timeZone } = useDashboardSettings();
  const openDevtools = useDevtoolsStore((s) => s.setOpen);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex items-center rounded-md transition-colors hover:bg-sidebar-accent",
              collapsed ? "justify-center p-2" : "w-full gap-2 p-3 text-left",
            )}
          />
        }
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
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align="start" className="w-56">
        <DropdownMenuGroup>
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
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={defaultHome} onValueChange={(value) => setDefaultHome(value as DefaultHome)}>
          <DropdownMenuLabel className="text-muted-foreground text-xs">Default home</DropdownMenuLabel>
          <DropdownMenuRadioItem value="finances">
            <ChartPie className="size-4" />
            Finances
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="today">
            <CalendarCheck className="size-4" />
            Today
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuLabel className="text-muted-foreground text-xs">Theme</DropdownMenuLabel>
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
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">Timezone</DropdownMenuLabel>
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
            <Globe className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{timeZone || "Not set yet"}</span>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {auth.userRole === "admin" && (
          <DropdownMenuItem onClick={() => openDevtools(true)}>
            <Database className="size-4" />
            Devtools
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={logout} disabled={logout.isPending}>
          <LogOut className="size-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
        <SidebarPanelRow collapsed={collapsed} onNavigate={onNavigate} />

        <Separator />

        <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      {onToggleCollapse && (
        <>
          <Separator />
          <div className={cn("flex p-2", collapsed ? "flex-col items-center" : "flex-col")}>
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
          </div>
        </>
      )}

      <SidebarUserMenu collapsed={collapsed} />
    </>
  );
}

/**
 * The floating buttons ride above --bottom-inset, which a page sets when it pins
 * something to the bottom edge itself — the assistant composer (see useBottomInset).
 */
const FAB_BOTTOM = "bottom-[calc(1rem_+_var(--bottom-inset))]";
const FAB_BOTTOM_STACKED = "bottom-[calc(4.75rem_+_var(--bottom-inset))]";

function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const hasIntegrationError = useIntegrationsHasError();
  const location = useSidebarLocation();
  const assistantEnabled = useAssistantEnabled();
  // On Today the stacked FAB would only re-open the same page, so it becomes
  // the assistant shortcut instead. That's the pair you hop between on a phone.
  const stackedToAssistant = location.isPath("/today") && assistantEnabled;

  useEffect(() => {
    return router.subscribe("onBeforeNavigate", () => setOpen(false));
  }, [router]);

  const openCommand = useCommandStore((s) => s.open);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="secondary"
              size="icon"
              className={cn("!rounded-full fixed left-4 z-40 size-11 shadow-lg md:hidden", FAB_BOTTOM)}
              aria-label={hasIntegrationError ? "Open menu (integrations error)" : "Open menu"}
            />
          }
        >
          <Menu className="size-5" />
          {hasIntegrationError ? (
            <span
              className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-rose-500 ring-2 ring-background"
              aria-hidden="true"
            />
          ) : null}
        </SheetTrigger>
        <SheetContent className="bg-sidebar text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>App navigation</SheetDescription>
          </SheetHeader>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <Link
        to={stackedToAssistant ? "/assistant" : "/today"}
        viewTransition
        className={buttonVariants({
          variant: "secondary",
          size: "icon",
          className: cn("!rounded-full fixed right-4 z-40 size-11 shadow-lg md:hidden", FAB_BOTTOM_STACKED),
        })}
        aria-label={stackedToAssistant ? "Open assistant" : "Open today"}
      >
        {stackedToAssistant ? <Sparkles className="size-5" /> : <CalendarCheck className="size-5" />}
      </Link>

      <Button
        variant="default"
        size="icon"
        className={cn("!rounded-full fixed right-4 z-40 size-11 shadow-lg md:hidden", FAB_BOTTOM)}
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
  const { toggle: toggleAssistant } = useAssistantSurface();
  const assistantEnabled = useAssistantEnabled();

  useHotkey(TOGGLE_SIDEBAR_HOTKEY, (e) => {
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    e.preventDefault();
    toggle();
  });

  useHotkey(
    TOGGLE_ASSISTANT_HOTKEY,
    (e) => {
      e.preventDefault();
      toggleAssistant();
    },
    { enabled: assistantEnabled },
  );

  return (
    <>
      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={toggle} />
      </aside>

      <MobileSidebar />
    </>
  );
}
