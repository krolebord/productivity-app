import { formatForDisplay } from "@tanstack/hotkeys";
import { Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TOGGLE_ASSISTANT_HOTKEY } from "@/lib/hotkeys";
import { useAssistantSurface } from "@/lib/use-assistant-surface";

/** Trailing header controls shared by the chat view and the chat list. */
export function AssistantHeaderActions() {
  const { isPage, openAsPage, close } = useAssistantSurface();

  return (
    <>
      {!isPage && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="Open as page"
              onClick={openAsPage}
            >
              <Maximize2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open as page</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label="Close assistant"
            aria-keyshortcuts={TOGGLE_ASSISTANT_HOTKEY}
            onClick={close}
          >
            <X className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Close <span className="hidden md:inline">({formatForDisplay(TOGGLE_ASSISTANT_HOTKEY)})</span>
        </TooltipContent>
      </Tooltip>
    </>
  );
}
