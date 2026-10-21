import { useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type RefObject } from 'react';

type FloatingPopoverProps = HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  align?: 'start' | 'end';
};

// Remains inside its owning dialog for focus/inert semantics, while the browser's
// top layer lets the panel escape scrolling containers and sticky table cells.
export function FloatingPopover({ open, onOpenChange, anchorRef, align = 'start', children, className = '', style, onKeyDown, ...props }: FloatingPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  useLayoutEffect(() => {
    const panel = panelRef.current, anchor = anchorRef.current;
    if (!open || !panel || !anchor) return;
    const nativePopover = typeof panel.showPopover === 'function';
    // Only one field picker is open at a time; this also works in fallback browsers.
    document.dispatchEvent(new CustomEvent('calla:open-picker', { detail: panel }));
    if (nativePopover) panel.showPopover();
    let frame = 0;
    const position = () => {
      frame = 0;
      if (!anchor.isConnected) { changeRef.current(false); return; }
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom < y || rect.top > y + height || rect.right < x || rect.left > x + width) { changeRef.current(false); return; }
      const gutter = 8, gap = 6;
      panel.style.setProperty('--floating-anchor-width', `${Math.min(rect.width, width - gutter * 2)}px`);
      panel.style.maxWidth = style?.maxWidth
        ? `min(${typeof style.maxWidth === 'number' ? `${style.maxWidth}px` : style.maxWidth}, ${Math.max(0, width - gutter * 2)}px)`
        : `${Math.max(0, width - gutter * 2)}px`;
      // Opening animations scale the visual box. Layout sizes stay stable so
      // alignment and viewport clamping remain correct after the animation.
      // Read the content height without expanding the scrollport: increasing
      // maxHeight first clamps scrollTop near the bottom of long option lists.
      const naturalHeight = panel.scrollHeight + panel.offsetHeight - panel.clientHeight;
      const below = Math.max(0, y + height - rect.bottom - gap - gutter);
      const above = Math.max(0, rect.top - y - gap - gutter);
      const upwards = naturalHeight > below && above > below;
      panel.dataset.side = upwards ? 'top' : 'bottom';
      panel.style.maxHeight = `${upwards ? above : below}px`;
      const panelWidth = panel.offsetWidth, panelHeight = panel.offsetHeight;
      const preferredLeft = align === 'end' ? rect.right - panelWidth : rect.left;
      panel.style.left = `${Math.max(x + gutter, Math.min(preferredLeft, x + width - panelWidth - gutter))}px`;
      panel.style.top = `${Math.max(y + gutter, upwards ? rect.top - gap - panelHeight : rect.bottom + gap)}px`;
      panel.style.visibility = 'visible';
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
    const scroll = (event: Event) => {
      // Scrolling this top-layer panel does not move its anchor.
      if (event.target instanceof Node && panel.contains(event.target)) return;
      schedule();
    };
    position();
    const observer = new ResizeObserver(schedule);
    observer.observe(anchor); observer.observe(panel);
    const outside = (event: PointerEvent) => {
      const path = event.composedPath();
      if (!path.includes(panel) && !path.includes(anchor)) changeRef.current(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation();
      changeRef.current(false); anchor.focus({ preventScroll: true });
    };
    const anotherPicker = (event: Event) => { if ((event as CustomEvent).detail !== panel) changeRef.current(false); };
    const leave = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!panel.contains(target) && !anchor.contains(target)) changeRef.current(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('focusin', leave);
    document.addEventListener('calla:open-picker', anotherPicker);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', scroll, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('focusin', leave);
      document.removeEventListener('calla:open-picker', anotherPicker);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', scroll, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      if (nativePopover && panel.matches(':popover-open')) panel.hidePopover();
    };
  }, [open, anchorRef, align]);
  if (!open) return null;
  return <div {...props} ref={panelRef} popover="manual" data-ui-floating="true"
    className={`floating-popover ${className}`} style={{ ...style, visibility: 'hidden' } as CSSProperties}
    onKeyDown={onKeyDown}>{children}</div>;
}
