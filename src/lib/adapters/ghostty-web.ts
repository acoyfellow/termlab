import type { TerminalAdapter } from '../terminal-adapter';
export const ghosttyWeb: TerminalAdapter = {
    id: 'ghostty-web',
    label: 'ghostty-web (Ghostty VT/WASM + canvas)',
    description: 'coder/ghostty-web. Ghostty’s VT parser compiled to WASM, canvas renderer, xterm.js-compatible API. Fast, but pixels: no browser find.',
    bundleHint: '~180KB gz (incl. WASM)',
    async mount(element, shell) {
        const { init, Terminal, FitAddon } = await import('ghostty-web');
        await init();
        const term = new Terminal({
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 13,
            theme: { background: '#000000', foreground: '#f2efe8', cursor: '#ffffff' },
            scrollback: 20000,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(element);
        fit.fit();
        const unsubscribe = shell.onOutput((chunk) => term.write(chunk));
        const input = term.onData((data) => shell.write(data));
        return {
            destroy() {
                unsubscribe();
                input.dispose();
                term.dispose();
            },
            fit: () => fit.fit(),
        };
    },
};
