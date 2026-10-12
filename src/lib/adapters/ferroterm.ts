import type { TerminalAdapter } from '../terminal-adapter';
export const ferrotermAdapter: TerminalAdapter = {
    id: 'ferroterm',
    label: 'ferroterm (Rust/WASM + WebGL)',
    description: 'DatanoiseTV/ferroterm. From-scratch VT core in Rust/WASM, WebGL renderer with Canvas2D fallback. Not on npm: built from source at f77d0c1.',
    bundleHint: '~16KB gz + 128KB WASM',
    async mount(element, shell) {
        const [{ Ferroterm }, { default: wasmUrl }] = await Promise.all([
            import('ferroterm'),
            import('ferroterm/pkg/ferroterm_wasm_bg.wasm?url'),
        ]);
        await import('ferroterm/style.css');
        const term = await Ferroterm.create(element, {
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 13,
            scrollback: 20000,
            wasmUrl,
        });
        const unsubscribe = shell.onOutput((chunk) => term.write(chunk));
        const decoder = new TextDecoder();
        const stopInput = term.onData((bytes) => shell.write(decoder.decode(bytes)));
        return {
            destroy() {
                unsubscribe();
                stopInput();
                term.dispose();
            },
            fit: () => term.fit(),
        };
    },
};
