import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared page chrome. Every page that uses it gets the same width, gutters and
 * card density, so navigating between sibling pages doesn't shift the layout.
 */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("@container mx-auto flex w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Primary actions, aligned with the title. */
  actions?: ReactNode;
  /** Secondary chrome rendered under the title row (tabs, toolbars). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-semibold text-xl">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex min-w-0 shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

/** A page-level control strip (filters, selects) placed above content. */
export function PageToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/** The dashed "nothing here yet" panel, shared so every finance tab matches. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-14 text-center",
        className,
      )}
    >
      {icon}
      <div>
        <p className="font-medium">{title}</p>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  actions,
  children,
  bodyClassName,
  className,
  actionsClassName,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
  actionsClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-lg border bg-card shadow-xs", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="flex min-w-0 items-center gap-2 font-medium text-sm">
            {icon}
            <span className="truncate">{title}</span>
          </h2>
          {actions ? <div className={cn("flex shrink-0 items-center gap-1.5", actionsClassName)}>{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
