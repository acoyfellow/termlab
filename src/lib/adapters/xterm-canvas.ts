/**
 * xterm.js with the canvas renderer addon.
 *
 * As of @xterm/xterm@6 the DEFAULT renderer is already the DOM renderer,
 * and canvas is an explicit opt-in addon. This is the historically-dominant
 * mode cloudshell ran on before the wterm spike.
 *
 * Properties:
 *   - Excellent perf for heavy output (GPU-adjacent painting)
 *   - No browser-native find or accessibility (canvas is opaque)
 *   - Mature measurement/reflow code
 */

import type { TerminalAdapter } from '../terminal-adapter';

export const xtermCanvas: TerminalAdapter = {
  id: 'xterm-canvas',
  label: 'xterm.js + canvas',
  description:
    'Canvas renderer addon. Fastest xterm mode for heavy output, but Cmd+F sees nothing and accessibility is limited.',
  bundleHint: '~200KB gz',
  async mount(element, shell) {
    const [{ Terminal }, { FitAddon }, { CanvasAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-canvas'),
    ]);
    await import('@xterm/xterm/css/xterm.css');

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
    term.loadAddon(new CanvasAddon());

    const unsubscribe = shell.onOutput((chunk) => term.write(chunk));
    term.onData((data) => shell.write(data));

    const doFit = () => {
      try {
        fit.fit();
      } catch {
        // ignore transient layout races
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
