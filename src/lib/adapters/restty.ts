import type { TerminalAdapter } from '../terminal-adapter';
export const resttyAdapter: TerminalAdapter = {
    id: 'restty',
    label: 'restty (libghostty-vt + WebGPU)',
    description: 'wiedymi/restty. Ghostty VT core in WASM, WebGPU renderer with WebGL2 fallback, its own text shaper. Loads fonts at startup, so first mount is slow.',
    bundleHint: '~700KB gz incl. fonts',
    async mount(element, shell) {
        const { Terminal } = await import('restty/xterm');
        const term = new Terminal({ fontSize: 13 });
        term.open(element);
        const unsubscribe = shell.onOutput((chunk) => term.write(chunk));
        const input = term.onData((data) => shell.write(data));
        return {
            destroy() {
                unsubscribe();
                input.dispose();
                term.dispose();
            },
            fit: () => term.restty?.updateSize(true),
        };
    },
};
