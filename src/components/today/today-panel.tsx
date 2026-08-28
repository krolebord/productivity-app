import { useNavigate } from "@tanstack/react-router";
import { Maximize2, X } from "lucide-react";
import { useAssistantNavigation } from "@/lib/use-assistant-navigation";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { TodayView } from "./today-view";

export function TodayPanel() {
  const { closePanel } = useAssistantNavigation();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
        <span className="min-w-0 flex-1 truncate px-1.5 font-semibold text-sm">Today</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="Open as page"
              onClick={() => {
                closePanel();
                navigate({ to: "/today", viewTransition: true });
              }}
            >
              <Maximize2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open as page</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="Close today panel"
              onClick={closePanel}
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <TodayView />
      </div>
    </div>
  );
}
