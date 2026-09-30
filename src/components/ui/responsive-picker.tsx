import type * as React from "react";

import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";

type ResponsivePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  trigger: React.ReactElement;
  triggerContent: React.ReactNode;
  children: React.ReactNode;
  popoverClassName?: string;
};

export function ResponsivePicker({
  open,
  onOpenChange,
  title,
  trigger,
  triggerContent,
  children,
  popoverClassName,
}: ResponsivePickerProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger render={trigger}>{triggerContent}</PopoverTrigger>
        <PopoverContent aria-label={title} className={cn("w-64 p-1", popoverClassName)}>
          {children}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger}>{triggerContent}</SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-border" />
        <SheetTitle className="px-1 pb-2 text-muted-foreground text-sm">{title}</SheetTitle>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
