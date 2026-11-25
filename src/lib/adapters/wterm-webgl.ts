import type { TerminalAdapter } from '../terminal-adapter';

export const wtermWebglAdapter: TerminalAdapter = {
  id: 'wterm-webgl',
  label: 'wterm (Zig/WASM + WebGL)',
  description:
    'vercel-labs/wterm with renderer: "webgl". Paints live output on WebGL2 and syncs DOM text when idle so find, selection and screen readers still work.',
  bundleHint: '~76KB gz incl. WASM',
  async mount(element, shell) {
    const { WTerm } = await import('@wterm/dom');
    await import('@wterm/dom/css');

    element.classList.add('termlab-wterm-host');

    const term = new WTerm(element, {
      cursorBlink: true,
      autoResize: true,
      renderer: 'webgl',
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
