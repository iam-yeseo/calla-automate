/** Mouse side buttons also work in the Electron shell, which has no browser toolbar. */
export function installHistoryMouseButtons(target: Window, traverse: (direction: -1 | 1) => void) {
  const releaseEvent = 'PointerEvent' in target ? 'pointerup' : 'mouseup';
  const handle = (event: MouseEvent) => {
    if (event.button !== 3 && event.button !== 4) return;
    // Own the gesture so Chromium cannot also navigate a second time.
    event.preventDefault();
    event.stopPropagation();
    if (event.type === releaseEvent) traverse(event.button === 3 ? -1 : 1);
  };
  const events = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick'] as const;
  events.forEach(type => target.addEventListener(type, handle, true));
  return () => events.forEach(type => target.removeEventListener(type, handle, true));
}
