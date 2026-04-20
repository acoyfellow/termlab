/**
 * Adapter contract — every terminal implementation gets a host element
 * + a FakeShell and mounts itself. The page renders a grid of these;
 * the FakeShell instances are independent so each terminal has its
 * own state.
 *
 * This keeps the comparison honest: every implementation reads bytes
 * from the SAME shell shape and sends user keystrokes back in the
 * SAME shape. The only thing varying is the renderer.
 */

import type { FakeShell } from './fake-shell';

export interface TerminalAdapter {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Module size (minified, gzipped if we know it) to display. */
  readonly bundleHint?: string;
  readonly mount: (element: HTMLElement, shell: FakeShell) => Promise<TerminalHandle>;
}

export interface TerminalHandle {
  destroy: () => void;
  /** Force a resize recompute. Useful when the grid cell is resized. */
  fit?: () => void;
}
