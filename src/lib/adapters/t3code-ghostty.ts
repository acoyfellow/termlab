import type { TerminalAdapter } from '../terminal-adapter';
export const t3codeGhosttyAdapter: TerminalAdapter = {
    id: 't3code-ghostty',
    label: 'T3 Code terminal (libghostty-vt WASM + Canvas 2D)',
    description: 'The terminal inside pingdotgg/t3code: the official libghostty-vt C ABI compiled to WASM, with its own Canvas 2D renderer and input surface. Not on npm: built from the MIT source at faa8ad6.',
    bundleHint: '~25KB gz + 616KB WASM',
    async mount(element, shell) {
        const [{ default: vt }, { default: pty }, { default: font }] = await Promise.all([
            import('t3code-ghostty/ghostty-vt.wasm?url'),
            import('t3code-ghostty/ghostty-write-pty.wasm?url'),
            import('t3code-ghostty/SymbolsNerdFontMono-Regular.woff2?url'),
        ]);
        (globalThis as { __T3_GHOSTTY_ASSETS?: Record<string, string> }).__T3_GHOSTTY_ASSETS = {
            'ghostty-vt.wasm': vt,
            'ghostty-write-pty.wasm': pty,
            'SymbolsNerdFontMono-Regular.woff2': font,
        };
        const { GhosttyTerminalSurface } = await import('t3code-ghostty');
        const color = (r: number, g: number, b: number) => ({ r, g, b });
        if (!document.getElementById("t3code-ghostty-css")) {
            const canvasCss = document.createElement("style");
            canvasCss.id = "t3code-ghostty-css";
            canvasCss.textContent = '[data-adapter="t3code-ghostty"] > canvas { display: block; width: 100%; height: 100%; }';
            document.head.append(canvasCss);
        }
        const term = await GhosttyTerminalSurface.create(element, {
            theme: { foreground: color(242, 239, 232), background: color(0, 0, 0), cursor: color(242, 239, 232) },
            font: { family: '"IBM Plex Mono", ui-monospace, monospace', size: 13 },
            onData: (data: string) => shell.write(data),
            onResize: () => {},
            onSelectionChange: () => {},
            beforeKey: () => true,
            onLinkActivate: () => {},
        });
        const unsubscribe = shell.onOutput((chunk) => term.write(chunk));
        return {
            destroy() {
                unsubscribe();
                term.dispose();
            },
            fit: () => term.fit(),
        };
    },
};
