import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useResolvedTheme } from "@/lib/theme-store";
import { cn } from "@/lib/utils";

// Radix sheets set pointer-events: none on body. Toasts inherit that, so they can
// paint above the assistant and still miss clicks unless they opt back in.
const Toaster = ({ className, style, toastOptions, ...props }: ToasterProps) => {
  const theme = useResolvedTheme();

  return (
    <Sonner
      theme={theme}
      className={cn("toaster group pointer-events-auto", className)}
      icons={{
        success: <CircleCheckIcon className="size-4 text-emerald-500" />,
        info: <InfoIcon className="size-4 text-blue-500" />,
        warning: <TriangleAlertIcon className="size-4 text-amber-500" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        ...toastOptions,
        className: cn("pointer-events-auto", toastOptions?.className),
      }}
      style={
        {
          "--normal-bg": "var(--color-popover)",
          "--normal-text": "var(--color-popover-foreground)",
          "--normal-border": "var(--color-border)",
          "--border-radius": "var(--radius)",
          zIndex: 2147483647,
          pointerEvents: "auto",
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
