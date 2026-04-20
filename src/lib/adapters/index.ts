/**
 * Public adapter registry. Adding a new terminal implementation =
 * new file in this dir + import + push here.
 */

import type { TerminalAdapter } from '../terminal-adapter';
import { xtermCanvas } from './xterm-canvas';
import { xtermWebgl } from './xterm-webgl';
import { xtermDom } from './xterm-dom';
import { wtermAdapter } from './wterm';
import { htermAdapter } from './hterm';

export const ADAPTERS: readonly TerminalAdapter[] = [
  xtermDom,
  xtermCanvas,
  xtermWebgl,
  wtermAdapter,
  htermAdapter,
];
