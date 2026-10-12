import type { TerminalAdapter } from '../terminal-adapter';
export const htermUpstreamAdapter: TerminalAdapter = {
    id: 'hterm-upstream',
    label: 'hterm upstream (libapps HEAD)',
    description: 'Current hterm built from Chromium libapps (1.92.1, f3b11d7). The npm hterm-umdjs package is a 2022 repackage; this row is what hterm is today.',
    bundleHint: '~79KB gz',
    async mount(element, shell) {
        const { hterm } = await import('hterm-upstream');
        await hterm.initPromise;
        let unsubscribe: (() => void) | null = null;
        const terminal = new hterm.Terminal();
        terminal.onTerminalReady = () => {
            const io = terminal.io.push();
            io.onVTKeystroke = (data: string) => shell.write(data);
            io.sendString = (data: string) => shell.write(data);
            unsubscribe = shell.onOutput((chunk) => io.print(chunk));
            terminal.setCursorVisible(true);
            terminal.getPrefs().set('font-family', '"IBM Plex Mono", ui-monospace, monospace');
            terminal.getPrefs().set('font-size', 13);
            terminal.getPrefs().set('background-color', '#000000');
            terminal.getPrefs().set('foreground-color', '#f2efe8');
            terminal.getPrefs().set('scrollbar-visible', true);
            terminal.getPrefs().set('enable-clipboard-notice', false);
        };
        terminal.decorate(element);
        terminal.installKeyboard();
        return {
            destroy() {
                unsubscribe?.();
                try {
                    terminal.uninstallKeyboard();
                    while (element.firstChild)
                        element.removeChild(element.firstChild);
                }
                catch {
                }
            },
        };
    },
};
