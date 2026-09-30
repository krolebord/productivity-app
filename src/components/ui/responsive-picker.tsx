import type * as React from "react";

import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger, DrawerVirtualKeyboardProvider } from "./drawer";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

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
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerTrigger render={trigger}>{triggerContent}</DrawerTrigger>
      <DrawerVirtualKeyboardProvider>
        <DrawerContent>
          <DrawerTitle className="px-4 py-2 font-normal text-muted-foreground text-sm">{title}</DrawerTitle>
          <div className="min-h-0 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </DrawerContent>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}
