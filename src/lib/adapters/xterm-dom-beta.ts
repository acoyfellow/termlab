import type { TerminalAdapter } from '../terminal-adapter';
export const xtermDomBeta: TerminalAdapter = {
    id: 'xterm-dom-beta',
    label: 'xterm.js 6.1 beta + DOM',
    description: 'xterm.js 6.1.0-beta.304 from npm (the 6.1 line has ~300 betas since 6.0.0). DOM renderer. Shown next to 6.0.0 stable so you can see what is coming.',
    bundleHint: '~82KB gz',
    async mount(element, shell) {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
            import('@xterm/xterm-beta'),
            import('@xterm/addon-fit'),
        ]);
        await import('@xterm/xterm-beta/css/xterm.css');
        const term = new Terminal({
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 13,
            cursorBlink: true,
            theme: { background: '#000', foreground: '#f2efe8', cursor: '#fff' },
            allowTransparency: true,
            scrollback: 20000,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(element);
        const unsubscribe = shell.onOutput((chunk) => term.write(chunk));
        term.onData((data) => shell.write(data));
        const doFit = () => {
            try {
                fit.fit();
            }
            catch {
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
