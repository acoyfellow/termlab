/**
 * termlab standardized benchmark matrix.
 *
 * Every terminal adapter is measured against the same checklist, and
 * the results render into a comparison table above the grid. When a
 * new terminal library shows up, it slots in by implementing the
 * TerminalAdapter contract (src/lib/terminal-adapter.ts) and the
 * harness automatically runs these benchmarks against it.
 *
 * The benchmark is deliberately a mix of:
 *   - static capability facts (does it render to DOM? does it expose
 *     text nodes browser find can see?)
 *   - dynamic measurements (mount time, write throughput, bundle size)
 *   - UX heuristics graded by a human clicking through
 *
 * The human-graded items live in this file too so they're visible
 * next to the code. The grades are my opinion after playing with
 * each implementation.
 */

export type BenchResult = 'pass' | 'fail' | 'partial' | 'unknown';

export interface BenchRow {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  /** true for dimensions we measure at runtime, false for static facts. */
  readonly measured: boolean;
}

/**
 * The rows of the benchmark table — shared across every adapter.
 * Ordering here is how they'll display in the UI.
 */
export const BENCH_ROWS: readonly BenchRow[] = [
  {
    key: 'mount-ms',
    label: 'Mount time',
    description:
      'Time from TerminalAdapter.mount() called → first frame paint. Lower is better.',
    measured: true,
  },
  {
    key: 'bundle-size',
    label: 'Bundle size',
    description: 'Published package size (minified + gzipped).',
    measured: false,
  },
  {
    key: 'cmd-find',
    label: 'Browser find (Cmd+F)',
    description:
      'Does the browser`s built-in find highlight text in the terminal output? Needs real DOM text nodes.',
    measured: false,
  },
  {
    key: 'selection',
    label: 'Native selection',
    description:
      'Can you click-drag to select text across wrapped lines, and Cmd+C to copy?',
    measured: false,
  },
  {
    key: 'a11y',
    label: 'Accessibility',
    description:
      'Does a screen reader see terminal output as real text?',
    measured: false,
  },
  {
    key: 'scroll',
    label: 'Scrollback UX',
    description:
      'Real browser scrollbar, wheel works anywhere on the terminal surface, position survives resize.',
    measured: false,
  },
  {
    key: 'ansi-256',
    label: '256-color ANSI',
    description: 'Full 256-color foreground/background palette support.',
    measured: false,
  },
  {
    key: 'box-align',
    label: 'Box-drawing alignment',
    description:
      'Unicode box characters align in columns (true monospace). Emojis break most renderers; box drawing is easier but still a filter.',
    measured: false,
  },
  {
    key: 'emoji-width',
    label: 'Wide-char width',
    description:
      'Emoji + CJK take the correct two cells instead of one-and-a-half.',
    measured: false,
  },
  {
    key: 'resize-robust',
    label: 'Resize robustness',
    description:
      'After resizing the host, the column count updates, the cursor stays put, wrapping recomputes correctly.',
    measured: false,
  },
  {
    key: 'throughput',
    label: 'Write throughput',
    description:
      'How many bytes/sec the terminal accepts before dropping frames. We fire a 10k-line burst and measure.',
    measured: true,
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    description:
      'Public health signals: last release date, issue activity, contributor count. Updated manually in code.',
    measured: false,
  },
  {
    key: 'license',
    label: 'License',
    description: 'SPDX identifier of the upstream package.',
    measured: false,
  },
] as const;

/**
 * Per-adapter static grades. The author's opinion after playing with
 * each library. When we add a new adapter, fill this in.
 *
 * Measured rows (mount-ms, throughput) are omitted here; the harness
 * writes them into this object at runtime.
 */
export type StaticGradeMap = Partial<
  Record<(typeof BENCH_ROWS)[number]['key'], { result: BenchResult; note?: string }>
>;

export const STATIC_GRADES: Record<string, StaticGradeMap> = {
  'xterm-dom': {
    'bundle-size': { result: 'partial', note: '~200KB gz' },
    'cmd-find': { result: 'pass' },
    selection: { result: 'pass' },
    a11y: { result: 'pass' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass' },
    'emoji-width': { result: 'partial', note: 'wcwidth-based; some emoji imperfect' },
    'resize-robust': { result: 'pass', note: 'FitAddon is idempotent' },
    maintenance: {
      result: 'pass',
      note: '10+ yrs active, VS Code / Codespaces / JupyterLab user',
    },
    license: { result: 'pass', note: 'MIT' },
  },
  'xterm-canvas': {
    'bundle-size': { result: 'partial', note: '~200KB gz' },
    'cmd-find': { result: 'fail', note: 'canvas pixels — browser sees nothing' },
    selection: { result: 'partial', note: 'custom selection, no Cmd+C to OS clipboard out of the box' },
    a11y: { result: 'fail', note: 'canvas is opaque to screen readers' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass' },
    'emoji-width': { result: 'partial' },
    'resize-robust': { result: 'pass' },
    maintenance: { result: 'pass' },
    license: { result: 'pass', note: 'MIT' },
  },
  'xterm-webgl': {
    'bundle-size': { result: 'partial', note: '~220KB gz (includes WebGL shaders)' },
    'cmd-find': { result: 'fail' },
    selection: { result: 'partial' },
    a11y: { result: 'fail' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass' },
    'emoji-width': { result: 'partial' },
    'resize-robust': { result: 'pass' },
    maintenance: { result: 'pass' },
    license: { result: 'pass', note: 'MIT' },
  },
  wterm: {
    'bundle-size': { result: 'pass', note: '~30KB gz incl. 13KB WASM' },
    'cmd-find': { result: 'pass' },
    selection: { result: 'pass' },
    a11y: { result: 'pass' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'partial', note: 'unknown — verify visually' },
    'box-align': { result: 'partial' },
    'emoji-width': { result: 'unknown' },
    'resize-robust': {
      result: 'fail',
      note: 'measured char-width breaks under CSS cascade races; caused weeks of pain in cloudshell',
    },
    maintenance: {
      result: 'fail',
      note: 'v0.1.x, 1 maintainer, vercel-labs',
    },
    license: { result: 'pass', note: 'MIT' },
  },
  hterm: {
    'bundle-size': { result: 'partial', note: '~180KB gz' },
    'cmd-find': { result: 'fail', note: 'iframe-canvas internal' },
    selection: { result: 'partial' },
    a11y: { result: 'fail' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass' },
    'emoji-width': { result: 'partial' },
    'resize-robust': { result: 'pass', note: 'Chromium-grade measurement' },
    maintenance: {
      result: 'pass',
      note: 'Chromium OS / Chrome Remote Desktop user, BSD-3',
    },
    license: { result: 'pass', note: 'BSD-3-Clause' },
  },
};
