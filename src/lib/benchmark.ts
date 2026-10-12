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
  cloudterm: {
    'bundle-size': { result: 'pass', note: '27KB gz incl. pretext' },
    'cmd-find': { result: 'pass' },
    selection: { result: 'pass' },
    a11y: { result: 'pass' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass', note: 'pretext-measured monospace' },
    'emoji-width': { result: 'pass', note: 'wcwidth tables, grapheme clusters' },
    'resize-robust': { result: 'pass', note: 'ResizeObserver; pretext layout is pure arithmetic' },
    maintenance: { result: 'partial', note: 'v0.0.10, single maintainer (acoyfellow/cloudterm)' },
    license: { result: 'pass', note: 'MIT' },
  },
  'cloudterm-perf': {
    'bundle-size': { result: 'pass', note: '27KB gz incl. pretext' },
    'cmd-find': { result: 'pass' },
    selection: { result: 'pass' },
    a11y: { result: 'pass' },
    scroll: { result: 'pass', note: '0 blank frames in scroll probe' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass' },
    'emoji-width': { result: 'pass', note: 'same grid as cloudterm' },
    'resize-robust': { result: 'pass' },
    maintenance: { result: 'partial', note: 'unreleased branch build' },
    license: { result: 'pass', note: 'MIT' },
  },
  'xterm-dom': {
    'bundle-size': { result: 'partial', note: '86KB gz' },
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
    'bundle-size': { result: 'partial', note: '~100KB gz' },
    'cmd-find': { result: 'fail', note: 'canvas pixels — browser sees nothing' },
    selection: { result: 'partial', note: 'custom selection, no Cmd+C to OS clipboard out of the box' },
    a11y: { result: 'fail', note: 'canvas is opaque to screen readers' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass' },
    'emoji-width': { result: 'partial' },
    'resize-robust': { result: 'pass' },
    maintenance: { result: 'fail', note: 'addon-canvas 0.7.0 (2024), peer dep xterm ^5' },
    license: { result: 'pass', note: 'MIT' },
  },
  'xterm-webgl': {
    'bundle-size': { result: 'partial', note: '120KB gz' },
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
    'bundle-size': { result: 'pass', note: '45KB gz incl. WASM' },
    'cmd-find': { result: 'pass' },
    selection: { result: 'pass' },
    a11y: { result: 'pass' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'partial', note: 'unknown — verify visually' },
    'box-align': { result: 'partial' },
    'emoji-width': { result: 'unknown' },
    'resize-robust': { result: 'unknown', note: 'v0.1 drifted under rapid resize; re-test on 0.5' },
    maintenance: { result: 'pass', note: 'v0.5.x, active, vercel-labs' },
    license: { result: 'pass', note: 'Apache-2.0' },
  },
  hterm: {
    'bundle-size': { result: 'partial', note: '140KB gz' },
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
      note: 'hterm-umdjs is a 2022 repackage; see hterm upstream row',
    },
    license: { result: 'pass', note: 'BSD-3-Clause' },
  },
  'ghostty-web': {
    'bundle-size': { result: 'fail', note: '180KB gz incl. WASM' },
    'cmd-find': { result: 'fail', note: 'canvas' },
    selection: { result: 'partial', note: 'custom selection' },
    a11y: { result: 'fail', note: 'canvas' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass' },
    'emoji-width': { result: 'pass', note: 'Ghostty VT width tables' },
    'resize-robust': { result: 'unknown' },
    maintenance: { result: 'partial', note: 'v0.4.x, coder' },
    license: { result: 'pass', note: 'MIT' },
  },
  'xterm-dom-beta': {
    'bundle-size': { result: 'partial', note: '82KB gz' },
    'cmd-find': { result: 'pass' },
    selection: { result: 'pass' },
    a11y: { result: 'pass' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass' },
    'emoji-width': { result: 'partial' },
    'resize-robust': { result: 'pass' },
    maintenance: { result: 'partial', note: 'beta; stable 6.0.0 is Dec 2025' },
    license: { result: 'pass', note: 'MIT' },
  },
  restty: {
    'bundle-size': { result: 'fail', note: '~700KB gz incl. bundled fonts' },
    'cmd-find': { result: 'fail', note: 'GPU canvas; has its own search UI' },
    selection: { result: 'partial', note: 'custom selection' },
    a11y: { result: 'fail', note: 'canvas' },
    scroll: { result: 'unknown' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass', note: 'text-shaper + box glyph drawing' },
    'emoji-width': { result: 'unknown' },
    'resize-robust': { result: 'unknown' },
    maintenance: { result: 'partial', note: 'v0.3.x, single maintainer' },
    license: { result: 'pass', note: 'MIT' },
  },
  ferroterm: {
    'bundle-size': { result: 'pass', note: '16KB gz JS + 128KB WASM' },
    'cmd-find': { result: 'fail', note: 'canvas; has findAll() API' },
    selection: { result: 'partial', note: 'custom selection' },
    a11y: { result: 'fail', note: 'canvas' },
    scroll: { result: 'unknown' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'unknown' },
    'emoji-width': { result: 'unknown' },
    'resize-robust': { result: 'unknown' },
    maintenance: { result: 'fail', note: 'not on npm; built from source' },
    license: { result: 'pass', note: 'MIT' },
  },
  auterm: {
    'bundle-size': { result: 'pass', note: '16KB gz' },
    'cmd-find': { result: 'fail', note: 'canvas' },
    selection: { result: 'partial' },
    a11y: { result: 'fail', note: 'canvas' },
    scroll: { result: 'unknown' },
    'ansi-256': { result: 'unknown' },
    'box-align': { result: 'unknown' },
    'emoji-width': { result: 'unknown' },
    'resize-robust': { result: 'unknown' },
    maintenance: { result: 'fail', note: 'v0.1.0, not on npm, 0 stars' },
    license: { result: 'pass', note: 'MIT' },
  },
  'hterm-upstream': {
    'bundle-size': { result: 'partial', note: '79KB gz' },
    'cmd-find': { result: 'fail', note: 'iframe internal' },
    selection: { result: 'partial' },
    a11y: { result: 'partial', note: 'has an accessibility reader' },
    scroll: { result: 'pass' },
    'ansi-256': { result: 'pass' },
    'box-align': { result: 'pass' },
    'emoji-width': { result: 'partial' },
    'resize-robust': { result: 'pass' },
    maintenance: { result: 'pass', note: 'Chromium libapps, active' },
    license: { result: 'pass', note: 'BSD-3-Clause' },
  },
};
