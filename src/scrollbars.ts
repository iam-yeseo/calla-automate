const IDLE_DELAY = 900;
const EDGE_DISTANCE = 14;
type PointerSample = Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerType'> & { path: EventTarget[] };

/** Reveal native scrollbars only while their scrolling area is being used. */
export function installScrollbarActivity() {
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const active = new Set<HTMLElement>();
  let hovered: HTMLElement | null = null;
  let dragged: HTMLElement | null = null;
  let pointerFrame = 0;
  let latestPointer: PointerSample | null = null;

  function reveal(element: HTMLElement) {
    clearTimeout(timers.get(element));
    timers.delete(element);
    element.dataset.scrollbarActive = '';
    active.add(element);
  }

  function hideAfterIdle(element: HTMLElement) {
    clearTimeout(timers.get(element));
    timers.delete(element);
    if (element === hovered || element === dragged) return;
    timers.set(element, setTimeout(() => {
      delete element.dataset.scrollbarActive;
      active.delete(element);
      timers.delete(element);
    }, IDLE_DELAY));
  }

  function scrollingElement(target: EventTarget | null) {
    return target === document ? document.scrollingElement as HTMLElement | null
      : target instanceof HTMLElement ? target : null;
  }

  function onScroll(event: Event) {
    const element = scrollingElement(event.target);
    if (!element) return;
    reveal(element);
    hideAfterIdle(element);
  }

  function isNearScrollbar(element: HTMLElement, x: number, y: number) {
    const isViewport = element === document.scrollingElement;
    const hasVerticalOverflow = element.scrollHeight > element.clientHeight + 1;
    const hasHorizontalOverflow = element.scrollWidth > element.clientWidth + 1;
    if (!hasVerticalOverflow && !hasHorizontalOverflow) return false;
    const style = getComputedStyle(element);
    const vertical = hasVerticalOverflow
      && (isViewport ? style.overflowY !== 'hidden' && style.overflowY !== 'clip' : /^(auto|scroll)$/.test(style.overflowY));
    const horizontal = hasHorizontalOverflow
      && (isViewport ? style.overflowX !== 'hidden' && style.overflowX !== 'clip' : /^(auto|scroll)$/.test(style.overflowX));
    if (!vertical && !horizontal) return false;
    const rect = isViewport ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight } : element.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
    const verticalEdge = style.direction === 'rtl' ? rect.left : rect.right;
    return vertical && Math.abs(x - verticalEdge) <= EDGE_DISTANCE
      || horizontal && rect.bottom - y <= EDGE_DISTANCE;
  }

  function scrollbarAtPointer(event: PointerEvent | PointerSample) {
    if (event.pointerType === 'touch') return null;
    const path = 'path' in event ? event.path : event.composedPath();
    for (const target of path) {
      if (target instanceof HTMLElement && isNearScrollbar(target, event.clientX, event.clientY)) return target;
    }
    const root = document.scrollingElement;
    return root instanceof HTMLElement && isNearScrollbar(root, event.clientX, event.clientY) ? root : null;
  }

  function setHovered(element: HTMLElement | null) {
    const previous = hovered;
    hovered = element;
    if (previous && previous !== hovered) hideAfterIdle(previous);
    if (hovered) reveal(hovered);
  }

  function onPointerMove(event: PointerEvent) {
    // The event path is cleared after dispatch, so snapshot it before the frame.
    latestPointer = { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType, path: event.composedPath() };
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      if (latestPointer) setHovered(scrollbarAtPointer(latestPointer));
    });
  }

  function onPointerDown(event: PointerEvent) {
    const element = scrollbarAtPointer(event);
    if (!element || event.button !== 0) return;
    dragged = element;
    reveal(element);
  }

  function onPointerUp(event?: PointerEvent) {
    const previous = dragged;
    dragged = null;
    if (event) setHovered(scrollbarAtPointer(event));
    if (previous) hideAfterIdle(previous);
  }

  function onPointerLeave() {
    latestPointer = null;
    setHovered(null);
  }

  function onBlur() {
    onPointerLeave();
    onPointerUp();
    for (const element of active) hideAfterIdle(element);
  }

  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('blur', onBlur);

  return () => {
    document.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('blur', onBlur);
    cancelAnimationFrame(pointerFrame);
    for (const timer of timers.values()) clearTimeout(timer);
    for (const element of active) delete element.dataset.scrollbarActive;
  };
}
