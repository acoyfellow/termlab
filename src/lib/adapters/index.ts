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
import { cloudterm } from './cloudterm';
import { ghosttyWeb } from './ghostty-web';
import { xtermDomBeta } from './xterm-dom-beta';
import { resttyAdapter } from './restty';
import { ferrotermAdapter } from './ferroterm';
import { autermAdapter } from './auterm';
import { htermUpstreamAdapter } from './hterm-upstream';

export const ADAPTERS: readonly TerminalAdapter[] = [
  cloudterm,
  xtermDom,
  xtermDomBeta,
  xtermCanvas,
  xtermWebgl,
  wtermAdapter,
  ghosttyWeb,
  resttyAdapter,
  ferrotermAdapter,
  autermAdapter,
  htermUpstreamAdapter,
  htermAdapter,
];
