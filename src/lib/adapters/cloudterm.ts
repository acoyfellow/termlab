/**
 * cloudterm \u2014 homegrown DOM terminal built on @chenglou/pretext.
 *
 * First-party adapter for the library Jordan built at
 * github.com/acoyfellow/cloudterm. Uses pretext for text
 * measurement + layout (no getBoundingClientRect reflow), renders
 * to DOM so Cmd+F / native selection / a11y all work, and ships
 * as a single mount() function.
 *
 * Since cloudterm isn't on npm yet, we link it via relative path in
 * termlab's package.json (`"cloudterm": "link:../cloudterm"`).
 * Once published, flip to a version range.
 */

import type { TerminalAdapter } from '../terminal-adapter';

export const cloudterm: TerminalAdapter = {
  id: 'cloudterm',
  label: 'cloudterm (pretext + DOM)',
  description:
    'Homegrown, minimal. Built on @chenglou/pretext for text measurement, renders to DOM spans. One dependency, async mount() API.',
  bundleHint: 'target <20KB gz',
  async mount(element, shell) {
    const { mount } = await import('cloudterm');
    try {
      await import('cloudterm/style.css');
    } catch {
      // optional default styles \u2014 fine if not present
    }

    const term = await mount(element, {
      onData: (bytes: Uint8Array) => {
        // The shared FakeShell interface takes string input.
        shell.write(new TextDecoder().decode(bytes));
      },
    });

    const unsubscribe = shell.onOutput((chunk: string) => term.write(chunk));

    return {
      destroy() {
        unsubscribe();
        term.destroy();
      },
      fit: () => term.fit(),
    };
  },
};
