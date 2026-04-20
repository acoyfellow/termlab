/**
 * xterm.js with the WebGL renderer addon.
 *
 * Properties:
 *   - Fastest renderer xterm offers; GPU-accelerated
 *   - Same selection/find limitations as canvas (pixels, not text)
 *   - Falls back to DOM automatically if WebGL context isn't available
 */

import type { TerminalAdapter } from '../terminal-adapter';

export const xtermWebgl: TerminalAdapter = {
  id: 'xterm-webgl',
  label: 'xterm.js + WebGL',
  description:
    'WebGL renderer addon. The fastest option — the paint happens on the GPU. Still pixel-based, so no browser find/select.',
  bundleHint: '~220KB gz',
  async mount(element, shell) {
    const [{ Terminal }, { FitAddon }, { WebglAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-webgl'),
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

    // WebGL addon has to be loaded after .open(). If the addon errors
    // (no WebGL context, fingerprinting protections, etc.) it emits a
    // 'contextLoss' event; we log + keep going on DOM fallback.
    let webgl: InstanceType<typeof WebglAddon> | null = null;
    try {
      webgl = new WebglAddon();
      term.loadAddon(webgl);
      webgl.onContextLoss(() => {
        console.warn('[xterm-webgl] context lost, disposing addon');
        webgl?.dispose();
      });
    } catch (err) {
      console.warn('[xterm-webgl] failed to initialize, DOM fallback', err);
    }

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
        webgl?.dispose();
        term.dispose();
      },
      fit: doFit,
    };
  },
};
