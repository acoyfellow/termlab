import type { TerminalAdapter } from '../terminal-adapter';
export const autermAdapter: TerminalAdapter = {
    id: 'auterm',
    label: 'auterm (Canvas 2D)',
    description: 'zkmio/auterm. TypeScript VT100/VT220 parser, Canvas 2D renderer, inline iframes via OSC 9001. Not on npm: built from source at b79bcb9.',
    bundleHint: '~16KB gz',
    async mount(element, shell) {
        const { Terminal } = await import('auterm');
        const term = new Terminal(element, {
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 13,
            scrollback: 20000,
        });
        const unsubscribe = shell.onOutput((chunk) => term.write(chunk));
        const stopInput = term.onData((data) => shell.write(data));
        return {
            destroy() {
                unsubscribe();
                stopInput();
                term.dispose();
            },
        };
    },
};
