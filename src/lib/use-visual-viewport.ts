import { useEffect, useRef } from "react";

/**
 * Mirrors the visual viewport into --viewport-height and --viewport-top. Mobile
 * keyboards shrink only the visual viewport, so a shell sized to 100dvh ends up
 * taller than the visible area and the browser pans the whole page over it.
 * Pinch zoom also shrinks the visual viewport, so it falls back to the defaults.
 *
 * While the keyboard is up, the page itself can still be dragged by the keyboard
 * height. The returned ref goes on the shell; drags inside it that no scroller
 * can take are cancelled so they never reach the page.
 */
export function useVisualViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const shell = ref.current;
    if (!viewport || !shell) return;
    const root = document.documentElement;
    let keyboardOpen = false;
    let lastTouch = { x: 0, y: 0 };

    const reset = () => {
      keyboardOpen = false;
      root.style.removeProperty("--viewport-height");
      root.style.removeProperty("--viewport-top");
    };
    const update = () => {
      if (viewport.scale !== 1) return reset();
      keyboardOpen = viewport.height < root.clientHeight - 1;
      root.style.setProperty("--viewport-height", `${viewport.height}px`);
      root.style.setProperty("--viewport-top", `${viewport.offsetTop}px`);
    };

    const onTouchStart = (event: TouchEvent) => {
      lastTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!keyboardOpen || event.touches.length !== 1) return;
      const { clientX, clientY } = event.touches[0];
      const dx = clientX - lastTouch.x;
      const dy = clientY - lastTouch.y;
      lastTouch = { x: clientX, y: clientY };
      if (Math.abs(dx) > Math.abs(dy)) return;
      if (event.cancelable && !canScrollWithin(event.target, shell, dy)) event.preventDefault();
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    shell.addEventListener("touchstart", onTouchStart, { passive: true });
    shell.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      shell.removeEventListener("touchstart", onTouchStart);
      shell.removeEventListener("touchmove", onTouchMove);
      reset();
    };
  }, []);

  return ref;
}

/** Whether a vertical drag of `dy` pixels from `target` scrolls something inside `boundary`. */
function canScrollWithin(target: EventTarget | null, boundary: HTMLElement, dy: number) {
  for (let el = target instanceof Element ? target : null; el && el !== boundary; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY !== "auto" && overflowY !== "scroll") continue;
    const canMove = dy > 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    if (canMove) return true;
  }
  return false;
}
