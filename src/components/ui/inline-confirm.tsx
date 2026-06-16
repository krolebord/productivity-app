import { Loader2 } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface UseInlineConfirmOptions {
  /** Runs on the second (confirming) click. May be async; `pending` is true while it resolves. */
  onConfirm: () => Promise<void> | void;
  /** Auto-disarm after this many ms of inactivity. Default 3000. */
  timeout?: number;
  /** Disarm when the button loses focus. Default true. */
  disarmOnBlur?: boolean;
  /** Disarm when the pointer leaves the button. Default true. */
  disarmOnPointerLeave?: boolean;
}

export interface InlineConfirmHandlers {
  onClick: (event: MouseEvent) => void;
  onBlur: (event: FocusEvent) => void;
  onPointerLeave: (event: PointerEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

export interface UseInlineConfirmResult {
  /** True after the first click — the button is waiting for a confirming second click. */
  armed: boolean;
  /** True while an async `onConfirm` is resolving. */
  pending: boolean;
  /** Force back to the resting state. */
  reset: () => void;
  /** Spread onto the target element to wire up the click-to-arm behavior. */
  getButtonProps: () => InlineConfirmHandlers;
}

/**
 * Headless "click again to confirm" behavior for destructive actions that are
 * too low-stakes for the global confirm dialog (see `useConfirmDialogStore`).
 *
 * State is local to each button. The caller owns rendering and branches on
 * `armed` / `pending`.
 */
export function useInlineConfirm({
  onConfirm,
  timeout = 3000,
  disarmOnBlur = true,
  disarmOnPointerLeave = true,
}: UseInlineConfirmOptions): UseInlineConfirmResult {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setArmed(false);
  }, [clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  const handleClick = useCallback(
    async (event: MouseEvent) => {
      // Keep the action self-contained — don't trigger row selection, menu
      // close, form submit, etc. from the arming/confirming click.
      event.preventDefault();
      event.stopPropagation();
      if (pending) {
        return;
      }
      if (!armed) {
        setArmed(true);
        clearTimer();
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setArmed(false);
          }
        }, timeout);
        return;
      }

      clearTimer();
      setPending(true);
      try {
        await onConfirm();
      } finally {
        // The element is often unmounted by a successful delete; guard setState.
        if (mountedRef.current) {
          setPending(false);
          setArmed(false);
        }
      }
    },
    [armed, pending, timeout, onConfirm, clearTimer],
  );

  const handleBlur = useCallback(() => {
    if (disarmOnBlur && !pending) {
      reset();
    }
  }, [disarmOnBlur, pending, reset]);

  const handlePointerLeave = useCallback(() => {
    if (disarmOnPointerLeave && !pending) {
      reset();
    }
  }, [disarmOnPointerLeave, pending, reset]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && armed) {
        event.stopPropagation();
        reset();
      }
    },
    [armed, reset],
  );

  const getButtonProps = useCallback(
    (): InlineConfirmHandlers => ({
      onClick: handleClick,
      onBlur: handleBlur,
      onPointerLeave: handlePointerLeave,
      onKeyDown: handleKeyDown,
    }),
    [handleClick, handleBlur, handlePointerLeave, handleKeyDown],
  );

  return { armed, pending, reset, getButtonProps };
}

export interface InlineConfirmButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "onClick" | "children">,
    Pick<UseInlineConfirmOptions, "timeout" | "disarmOnBlur" | "disarmOnPointerLeave"> {
  onConfirm: () => Promise<void> | void;
  /** Resting content. */
  children: React.ReactNode;
  /** Content shown once armed. Default "Confirm". */
  confirmContent?: React.ReactNode;
  /** Content shown while `onConfirm` resolves. Default a spinner. */
  pendingContent?: React.ReactNode;
  /** Tooltip shown while armed. Default "Click again to confirm". Pass null to hide. */
  tooltip?: React.ReactNode;
}

/**
 * Thin wrapper over `Button` for the common inline-confirm case: swaps to a
 * destructive label + tooltip on the first click, runs `onConfirm` on the second.
 */
export function InlineConfirmButton({
  onConfirm,
  children,
  confirmContent = "Confirm",
  pendingContent,
  tooltip = "Click again to confirm",
  timeout,
  disarmOnBlur,
  disarmOnPointerLeave,
  variant = "ghost",
  disabled,
  ...props
}: InlineConfirmButtonProps) {
  const { armed, pending, getButtonProps } = useInlineConfirm({
    onConfirm,
    timeout,
    disarmOnBlur,
    disarmOnPointerLeave,
  });

  const button = (
    <Button variant={armed ? "destructive" : variant} disabled={disabled || pending} {...props} {...getButtonProps()}>
      {pending ? (pendingContent ?? <Loader2 className="animate-spin" />) : armed ? confirmContent : children}
    </Button>
  );

  if (tooltip == null) {
    return button;
  }

  return (
    <Tooltip open={armed}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
