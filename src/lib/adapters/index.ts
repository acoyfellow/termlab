/**
 * Public adapter registry. Adding a new terminal implementation =
 * new file in this dir + import + push here.
 */

import type { TerminalAdapter } from '../terminal-adapter';
import { xtermCanvas } from './xterm-canvas';
import { xtermWebgl } from './xterm-webgl';
import { xtermDom } from './xterm-dom';
import { wtermAdapter } from './wterm';
import { wtermWebglAdapter } from './wterm-webgl';
import { htermAdapter } from './hterm';
import { cloudterm } from './cloudterm';
import { ghosttyWeb } from './ghostty-web';
import { xtermDomBeta } from './xterm-dom-beta';
import { resttyAdapter } from './restty';
import { ferrotermAdapter } from './ferroterm';
import { autermAdapter } from './auterm';
import { htermUpstreamAdapter } from './hterm-upstream';
import { t3codeGhosttyAdapter } from './t3code-ghostty';

export const ADAPTERS: readonly TerminalAdapter[] = [
  cloudterm,
  xtermDom,
  xtermDomBeta,
  xtermCanvas,
  xtermWebgl,
  wtermAdapter,
  wtermWebglAdapter,
  ghosttyWeb,
  resttyAdapter,
  ferrotermAdapter,
  t3codeGhosttyAdapter,
  autermAdapter,
  htermUpstreamAdapter,
  htermAdapter,
];
