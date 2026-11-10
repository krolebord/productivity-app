import { formatForDisplay } from "@tanstack/hotkeys";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarStore } from "@/lib/sidebar-store";
import { cn } from "@/lib/utils";

/**
 * Sidebar building blocks. Every row in the sidebar — destination link, panel
 * toggle, group header, sub-row — is built from these, so there is one place
 * deciding what a row looks like and how it reads as active.
 */

/** A link target, typed by the router so `search` stays checked. */
export type SidebarLinkTarget = Pick<LinkProps, "to" | "search">;

export function SidebarTooltip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: ReactElement;
}) {
  if (!collapsed) return children;

  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function sidebarRowClass({
  collapsed,
  isActive,
  /** Group headers put the padding on their inner link instead. */
  unpadded,
}: {
  collapsed?: boolean;
  isActive?: boolean;
  unpadded?: boolean;
}) {
  return cn(
    "flex items-center rounded-md font-medium text-sm transition-colors",
    unpadded ? "gap-2" : collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
  );
}

export function sidebarSubRowClass({ isActive }: { isActive?: boolean }) {
  return cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70",
  );
}

/** Fixed-width slot so dots, icons and bare labels line up across sub-rows. */
export function SidebarSubRowMarker({ children }: { children: ReactNode }) {
  return <span className="flex size-3.5 shrink-0 items-center justify-center">{children}</span>;
}

export function SidebarNavLink({
  target,
  label,
  icon: Icon,
  isActive,
  collapsed,
  hasError,
  onNavigate,
}: {
  target: SidebarLinkTarget;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  collapsed: boolean;
  /** Error dot on the row; collapsed tooltip mentions it too. */
  hasError?: boolean;
  onNavigate?: () => void;
}) {
  const tooltipLabel = hasError ? `${label} (error)` : label;

  return (
    <SidebarTooltip label={tooltipLabel} collapsed={collapsed}>
      <Link
        {...target}
        onClick={onNavigate}
        viewTransition
        aria-label={collapsed || hasError ? tooltipLabel : undefined}
        className={sidebarRowClass({ collapsed, isActive })}
      >
        <span className="relative">
          <Icon className="size-4 shrink-0" />
          {hasError && collapsed ? (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-rose-500" aria-hidden="true" />
          ) : null}
        </span>
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        {hasError && !collapsed ? (
          <span className="size-2 shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
        ) : null}
      </Link>
    </SidebarTooltip>
  );
}

export function SidebarSubLink({
  target,
  label,
  isActive,
  marker,
  onNavigate,
}: {
  target: SidebarLinkTarget;
  label: string;
  isActive: boolean;
  marker?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link {...target} viewTransition onClick={onNavigate} className={sidebarSubRowClass({ isActive })}>
      {marker ? <SidebarSubRowMarker>{marker}</SidebarSubRowMarker> : null}
      <span className="flex-1 truncate text-left">{label}</span>
    </Link>
  );
}

/**
 * A destination that also lists its contents. Collapsed sidebars drop the list
 * and fall back to a plain link, since there is no room for hierarchy.
 */
export function SidebarNavGroup({
  groupKey,
  target,
  label,
  icon: Icon,
  isActive,
  collapsed,
  defaultOpen = true,
  onNavigate,
  children,
}: {
  /** Persisted open/closed key in the sidebar store. */
  groupKey: string;
  target: SidebarLinkTarget;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  collapsed: boolean;
  defaultOpen?: boolean;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const groupOpen = useSidebarStore((s) => s.groups[groupKey]);
  const setGroupOpen = useSidebarStore((s) => s.setGroupOpen);

  if (collapsed) {
    return (
      <SidebarNavLink
        target={target}
        label={label}
        icon={Icon}
        isActive={isActive}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <Collapsible open={groupOpen ?? defaultOpen} onOpenChange={(open) => setGroupOpen(groupKey, open)}>
      <div className={sidebarRowClass({ isActive, unpadded: true })}>
        <Link {...target} viewTransition onClick={onNavigate} className="flex flex-1 items-center gap-2 px-3 py-2">
          <Icon className="size-4 shrink-0" />
          {label}
        </Link>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="mr-2 rounded-sm p-0.5 opacity-60 transition-opacity hover:opacity-100"
              aria-label={`Toggle ${label.toLowerCase()} list`}
            />
          }
        >
          <ChevronDown className="size-3.5 transition-transform [[data-closed]_&]:-rotate-90" />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-0.5 ml-4 flex flex-col gap-0.5 border-sidebar-border/50 border-l pl-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A panel: an overlay that opens beside the page rather than a destination.
 * Styled apart from nav links so "shows a panel" and "goes somewhere" don't look
 * identical. Falls back to a link on mobile, where panels are full pages.
 */
export function SidebarPanel({
  icon: Icon,
  label,
  isOpen,
  collapsed,
  hotkey,
  unreadCount = 0,
  onToggle,
  target,
  onNavigate,
}: {
  icon: LucideIcon;
  label: string;
  /** Panel open, or — in link mode — the page being viewed. */
  isOpen: boolean;
  collapsed: boolean;
  hotkey?: string;
  unreadCount?: number;
  onToggle?: () => void;
  /** When set, the panel is a page instead (mobile). */
  target?: SidebarLinkTarget;
  onNavigate?: () => void;
}) {
  const className = cn(
    "relative flex items-center justify-center gap-1.5 rounded-md border border-transparent py-1.5 font-medium text-sm transition-colors",
    collapsed ? "size-8" : "flex-1 px-2",
    isOpen
      ? "border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
  );
  const showBadge = unreadCount > 0 && !isOpen;
  const activityLabel = showBadge ? `${label}, ${unreadCount} unread chats` : label;
  const tooltipLabel = hotkey ? `${activityLabel} (${formatForDisplay(hotkey)})` : activityLabel;
  const badge = showBadge && (
    <span
      aria-hidden="true"
      className="absolute top-0 right-0 flex h-4 min-w-4 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] text-primary-foreground leading-none"
    >
      {unreadCount > 9 ? "9+" : unreadCount}
    </span>
  );

  if (target) {
    return (
      <SidebarTooltip label={tooltipLabel} collapsed={collapsed}>
        <Link {...target} viewTransition onClick={onNavigate} className={className} aria-label={activityLabel}>
          <Icon className="size-4 shrink-0" />
          {!collapsed && label}
          {badge}
        </Link>
      </SidebarTooltip>
    );
  }

  return (
    <SidebarTooltip label={tooltipLabel} collapsed={collapsed}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isOpen}
        aria-label={`${isOpen ? "Close" : "Open"} ${label.toLowerCase()} panel${showBadge ? `, ${unreadCount} unread chats` : ""}`}
        aria-keyshortcuts={hotkey}
        className={className}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && label}
        {badge}
      </button>
    </SidebarTooltip>
  );
}
