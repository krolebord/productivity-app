import { useCanGoBack, useMatches, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { useAssistantNavigation } from "@/lib/use-assistant-navigation";
import { useIsDesktop } from "@/lib/use-media-query";

const ASSISTANT_PAGE_PATH = "/assistant";

/** True while the assistant owns the whole page instead of the right rail. */
export function useIsAssistantPage() {
  const matches = useMatches();
  return matches.some((match) => match.fullPath === ASSISTANT_PAGE_PATH);
}

/**
 * Where the assistant shows up: a resizable panel beside the page on desktop,
 * its own page on mobile. Callers ask to open/close/toggle "the assistant" and
 * this picks the surface, so no caller has to branch on viewport itself.
 */
export function useAssistantSurface() {
  const isPage = useIsAssistantPage();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { openPanel, closePanel, togglePanel } = useAssistantNavigation();

  const openAsPage = useCallback(() => {
    navigate({ to: ASSISTANT_PAGE_PATH, viewTransition: true });
  }, [navigate]);

  const open = useCallback(() => {
    if (isPage) return;
    if (isDesktop) {
      openPanel("assistant");
      return;
    }
    openAsPage();
  }, [isPage, isDesktop, openPanel, openAsPage]);

  const close = useCallback(() => {
    if (!isPage) {
      closePanel();
      return;
    }
    if (canGoBack) {
      router.history.back();
      return;
    }
    navigate({ to: "/", viewTransition: true });
  }, [isPage, closePanel, canGoBack, router, navigate]);

  const toggle = useCallback(() => {
    if (isPage) {
      close();
      return;
    }
    if (isDesktop) {
      togglePanel("assistant");
      return;
    }
    openAsPage();
  }, [isPage, isDesktop, close, togglePanel, openAsPage]);

  return { isPage, open, openAsPage, close, toggle };
}
