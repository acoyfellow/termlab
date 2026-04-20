/**
 * wterm (@wterm/dom + @wterm/core) from vercel-labs/wterm.
 *
 * Zig + WASM core (13KB WASM inlined into the JS bundle), DOM
 * renderer. Dropped into cloudshell on the spike; measurement code is
 * young and broke repeatedly during real-world use. Here unmodified
 * so we can evaluate it against its peers side-by-side.
 */

import type { TerminalAdapter } from '../terminal-adapter';

export const wtermAdapter: TerminalAdapter = {
  id: 'wterm',
  label: 'wterm (Zig/WASM + DOM)',
  description:
    'vercel-labs/wterm. Zig core compiled to WASM, DOM renderer. v0.1.x, one maintainer. Small payload but measurement code is the fragile part we hit in cloudshell.',
  bundleHint: '~30KB gz (incl. 13KB WASM)',
  async mount(element, shell) {
    const { WTerm } = await import('@wterm/dom');
    await import('@wterm/dom/css');

    element.classList.add('termlab-wterm-host');

    const term = new WTerm(element, {
      cursorBlink: true,
      autoResize: true,
      onData: (data) => shell.write(data),
    });
    await term.init();

    const unsubscribe = shell.onOutput((chunk) => term.write(chunk));

    return {
      destroy() {
        unsubscribe();
        term.destroy();
      },
    };
  },
};
