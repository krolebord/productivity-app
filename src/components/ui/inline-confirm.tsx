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
  onConfirm: () => Promise<void> | void;
  timeout?: number;
  disarmOnBlur?: boolean;
  disarmOnPointerLeave?: boolean;
}

export interface InlineConfirmHandlers {
  onClick: (event: MouseEvent) => void;
  onBlur: (event: FocusEvent) => void;
  onPointerLeave: (event: PointerEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

export interface UseInlineConfirmResult {
  armed: boolean;
  pending: boolean;
  reset: () => void;
  getButtonProps: () => InlineConfirmHandlers;
}

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
  children: React.ReactNode;
  confirmContent?: React.ReactNode;
  pendingContent?: React.ReactNode;
  tooltip?: React.ReactNode;
}

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
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
