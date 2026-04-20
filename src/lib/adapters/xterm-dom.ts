/**
 * xterm.js with its built-in DOM renderer (the default in v6+).
 *
 * This is the option I argued for during the cloudshell spike but
 * didn't actually try. Same battle-tested measurement code as the
 * canvas/WebGL modes, but DOM rendering means:
 *   - Cmd+F works (real text nodes)
 *   - Native selection works
 *   - Accessibility tree is real
 *
 * The tradeoff is rendering perf on very long continuous output.
 * Let's see.
 */

import type { TerminalAdapter } from '../terminal-adapter';

export const xtermDom: TerminalAdapter = {
  id: 'xterm-dom',
  label: 'xterm.js + DOM (default)',
  description:
    'xterm.js with the DOM renderer (v6 default). Real text nodes — Cmd+F, selection, a11y all work. Measurement code is shared with canvas/WebGL modes.',
  bundleHint: '~200KB gz',
  async mount(element, shell) {
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    await import('@xterm/xterm/css/xterm.css');

    // No canvas/WebGL addon loaded — terminal uses its DOM renderer.
    const term = new Terminal({
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: { background: '#000', foreground: '#f2efe8', cursor: '#fff' },
      allowTransparency: true,
      scrollback: 20_000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);

    const unsubscribe = shell.onOutput((chunk) => term.write(chunk));
    term.onData((data) => shell.write(data));

    const doFit = () => {
      try {
        fit.fit();
      } catch {
        // ignore
      }
    };
    doFit();
    requestAnimationFrame(doFit);

    const ro = new ResizeObserver(() => doFit());
    ro.observe(element);

    return {
      destroy() {
        ro.disconnect();
        unsubscribe();
        term.dispose();
      },
      fit: doFit,
    };
  },
};
