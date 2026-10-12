import type { TerminalAdapter } from '../terminal-adapter';

export const cloudterm: TerminalAdapter = {
  id: 'cloudterm',
  label: 'cloudterm (pretext + DOM)',
  description:
    'Homegrown, minimal. Built on @chenglou/pretext for text measurement, renders to DOM spans. One dependency, async mount() API.',
  bundleHint: '~27KB gz incl. pretext',
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
