let holders = 0;
let nativeFocus: typeof HTMLElement.prototype.focus | null = null;
let restoreScroll: (() => void) | null = null;

function focusWithoutScrolling(this: HTMLElement, options?: FocusOptions): void {
  nativeFocus!.call(this, { ...options, preventScroll: true });
}

export function holdPagePosition(): () => void {
  if (holders++ === 0) {
    nativeFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = focusWithoutScrolling;
    const x = window.scrollX;
    const y = window.scrollY;
    let userMoved = false;
    const markUserMoved = () => void (userMoved = true);
    const keep = () => {
      if (!userMoved && (window.scrollX !== x || window.scrollY !== y)) window.scrollTo(x, y);
    };
    const userEvents = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const;
    for (const type of userEvents) window.addEventListener(type, markUserMoved, { passive: true, capture: true });
    window.addEventListener('scroll', keep);
    restoreScroll = () => {
      window.removeEventListener('scroll', keep);
      for (const type of userEvents) window.removeEventListener(type, markUserMoved, { capture: true });
      keep();
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--holders > 0) return;
    HTMLElement.prototype.focus = nativeFocus!;
    nativeFocus = null;
    restoreScroll?.();
    restoreScroll = null;
  };
}
