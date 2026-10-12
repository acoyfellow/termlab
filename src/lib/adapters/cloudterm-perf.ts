import type { TerminalAdapter } from '../terminal-adapter';
export const cloudtermPerf: TerminalAdapter = {
    id: 'cloudterm-perf',
    label: 'cloudterm-perf (optimization branch)',
    description: 'Unreleased cloudterm optimization build, pinned to a commit on the perf branch. Same DOM renderer as cloudterm; faster parser and grid writes.',
    bundleHint: '~27KB gz incl. pretext',
    async mount(element, shell) {
        const { mount } = await import('cloudterm-perf');
        try {
            await import('cloudterm-perf/style.css');
        }
        catch {
        }
        const term = await mount(element, {
            onData: (bytes: Uint8Array) => {
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
