/**
 * hterm — the terminal library from Chromium OS. Powers Chrome
 * Remote Desktop, the old Secure Shell extension, crosh, etc. Mature,
 * unusual in its packaging (UMD only, no ESM), but well-tested.
 *
 * Gotcha: hterm's storage layer writes prefs to localStorage. For the
 * comparison we pass `hterm.defaultStorage = new hterm.Storage.Memory()`
 * so nothing leaks across terminals.
 *
 * Uses `hterm-umdjs`, a small packaging of hterm for npm consumption.
 */

import type { TerminalAdapter } from '../terminal-adapter';

export const htermAdapter: TerminalAdapter = {
  id: 'hterm',
  label: 'hterm (Chromium)',
  description:
    'Chromium OS terminal, powers Chrome Remote Desktop + crosh. Mature, unusual packaging (UMD). Uses <iframe> canvas internally.',
  bundleHint: '~180KB gz',
  async mount(element, shell) {
    // hterm-umdjs attaches to globalThis when imported; pull the
    // namespaces off that.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore \u2014 UMD module, no ESM types
    const mod = await import('hterm-umdjs');
    // mod.default or mod itself — UMD shakes out differently across bundlers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hterm: any = (mod as any).hterm ?? (globalThis as any).hterm;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lib: any = (mod as any).lib ?? (globalThis as any).lib;
    if (!hterm || !lib) {
      throw new Error('hterm UMD did not expose hterm/lib globals');
    }

    // In-memory storage so we don't pollute localStorage when the user
    // is flipping between comparison terminals.
    hterm.defaultStorage = new lib.Storage.Memory();

    await new Promise<void>((resolve) => lib.init(resolve));

    let unsubscribe: (() => void) | null = null;

    const terminal = new hterm.Terminal();
    terminal.onTerminalReady = () => {
      const io = terminal.io.push();
      io.onVTKeystroke = (data: string) => shell.write(data);
      io.sendString = (data: string) => shell.write(data);
      unsubscribe = shell.onOutput((chunk) => io.print(chunk));
      terminal.setCursorVisible(true);
    };
    terminal.getPrefs().set('font-family', '"IBM Plex Mono", ui-monospace, monospace');
    terminal.getPrefs().set('font-size', 13);
    terminal.getPrefs().set('background-color', '#000000');
    terminal.getPrefs().set('foreground-color', '#f2efe8');
    terminal.getPrefs().set('scrollbar-visible', true);
    terminal.getPrefs().set('enable-clipboard-notice', false);
    terminal.decorate(element);
    terminal.installKeyboard();

    return {
      destroy() {
        unsubscribe?.();
        try {
          terminal.uninstallKeyboard();
          // hterm doesn't expose a clean teardown; just empty the host.
          while (element.firstChild) element.removeChild(element.firstChild);
        } catch {
          // ignore
        }
      },
    };
  },
};
