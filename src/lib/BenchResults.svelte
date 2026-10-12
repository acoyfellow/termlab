<script lang="ts">
  import results from './bench-results.json';

  type Workload = keyof typeof results.workloads;
  const workloads = Object.keys(results.workloads) as Workload[];
  const labels: Record<Workload, string> = {
    'scroll-flood': 'Scroll flood',
    'full-redraw': 'Full redraw',
    'sgr-tokens': 'SGR tokens',
  };

  type Row = (typeof results.terminals)[number];
  const verified = (t: Row) => !t.unverifiedTiming;
  const best = (pick: (t: Row) => number | null, rows: Row[] = results.terminals) =>
    Math.min(...rows.map(pick).filter((v): v is number => v != null));
  const fastest = Object.fromEntries(workloads.map((w) => [w, best((t) => t.timings[w].medianMs, results.terminals.filter(verified))])) as Record<Workload, number>;
  const smallest = best((t) => t.gzipBytes);
  const quickestMount = best((t) => t.mountMs, results.terminals.filter(verified));
  const leanestHeap = best((t) => t.heapMB);

  const ratio = (value: number | null, min: number) => (value == null ? '' : value === min ? 'best' : `${(value / min).toFixed(1)}×`);
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
  const date = new Date(results.generatedAt).toISOString().slice(0, 10);
  const excluded = [
    { name: 'xterm.js + canvas', url: 'https://www.npmjs.com/package/@xterm/addon-canvas', reason: 'addon-canvas 0.7.0 (2024) declares a peer dependency on xterm 5. It still loads in the live grid below, but a timing next to xterm 6 would not be like-for-like.' },
    { name: 'beamterm', url: 'https://github.com/junkdog/beamterm', reason: 'a WebGL2 cell renderer with no VT/ANSI parser. It cannot accept terminal output, so these workloads do not apply.' },
    { name: 'SwiftTerm (WASM)', url: 'https://github.com/migueldeicaza/SwiftTerm', reason: 'browser engine needs the pinned swift-6.4.0 Swift.org toolchain and WASM SDK; not built yet.' },
    { name: 'frankenterm', url: 'https://github.com/Dicklesworthstone/frankenterm', reason: 'a Rust terminal hypervisor for WezTerm agent fleets with an HTTP/SSE API. It has no browser renderer.' },
    { name: 'browstty', url: 'https://github.com/Snoupix/browstty', reason: 'a libghostty WASM playground, no terminal component yet.' },
    { name: 'jquery.terminal', url: 'https://github.com/jcubic/jquery.terminal', reason: 'a command-line widget for web apps, not a VT emulator.' },
  ];
</script>

<section class="results" aria-labelledby="results-title">
  <div class="head">
    <h2 id="results-title">Throughput benchmark</h2>
    <p>
      Median of {results.rounds} rounds. Each sample runs in a fresh headless Chromium, the order of
      terminals alternates each round, and the timer stops when the end marker is visible in the
      terminal after a painted frame. Lower is better.
    </p>
  </div>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>Terminal</th>
          <th>Version</th>
          {#each workloads as w (w)}<th title={results.workloads[w]}>{labels[w]}</th>{/each}
          <th>Mount</th>
          <th>Heap</th>
          <th>Bundle (gz)</th>
          <th>Text in DOM</th>
        </tr>
      </thead>
      <tbody>
        {#each results.terminals as t (t.id)}
          <tr>
            <th>{t.id}</th>
            <td class="mono">{t.version}</td>
            {#each workloads as w (w)}
              {@const m = t.timings[w].medianMs}
              {#if t.unverifiedTiming}
                <td class="unverified" title={t.unverifiedTiming}>{m} ms <span class="ratio">unverified</span></td>
              {:else}
                <td class:best={m === fastest[w]}>
                  {m == null ? `${t.timings[w].failures} failed` : `${m} ms`}
                  <span class="ratio">{ratio(m, fastest[w])}</span>
                </td>
              {/if}
            {/each}
            <td class:best={verified(t) && t.mountMs === quickestMount}>{t.mountMs} ms <span class="ratio">{ratio(t.mountMs, quickestMount)}</span></td>
            <td class:best={t.heapMB === leanestHeap}>{t.heapMB} MB <span class="ratio">{ratio(t.heapMB, leanestHeap)}</span></td>
            <td class:best={t.gzipBytes === smallest}>{kb(t.gzipBytes)} <span class="ratio">{ratio(t.gzipBytes, smallest)}</span></td>
            <td class={t.textInDom ? 'yes' : 'no'}>{t.textInDom ? 'yes' : t.canvas ? 'no (canvas)' : 'no'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="cpu-breakdown">
    <h3>CPU breakdown</h3>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Terminal</th>
            {#each workloads as w (w)}<th>{labels[w]}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each results.terminals as t (t.id)}
            <tr>
              <th>{t.id}</th>
              {#each workloads as w (w)}
                {@const timing = t.timings[w]}
                <td class:unverified={t.unverifiedTiming}>
                  {timing.cpuMs.medianMs} ms
                  <span class="ratio">script {timing.scriptMs.medianMs} · layout {timing.styleLayoutMs.medianMs} · paint {timing.paintMs.medianMs} · longest {timing.longestTaskMs.medianMs}</span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
  <ul class="notes">
    {#each workloads as w (w)}<li><strong>{labels[w]}:</strong> {results.workloads[w]}, {results.grid} grid, written in 16 KB chunks.</li>{/each}
    <li>Run {date} on {results.machine}, {results.browser}, GPU: {results.gpu}.</li>
    <li>"Text in DOM" means the end marker is readable as page text, so browser find, native selection and screen readers can see it.</li>
    <li>restty's mount time includes downloading its fonts from a CDN. ferroterm, auterm and hterm upstream have no npm release; they are built from source at the commits in <a href="https://github.com/acoyfellow/termlab/blob/main/vendor/SOURCES.md">vendor/SOURCES.md</a>.</li>
    <li><strong>cloudterm-perf</strong> tracks cloudterm main during the optimization loop, pinned to a commit, beside the last released row so each step is visible. Step 1 (v0.0.12): row-segment ASCII writes, cached single-code SGR, reused scrollback rows, one fewer frame at mount; output is fuzz-checked identical to v0.0.11 on 30,000 random inputs. Still behind: SGR-heavy output (ferroterm, wterm) and mount (wterm, auterm, within one frame). Gate it is chasing: every workload and mount within one frame (17 ms) of the best verified rival. Current gaps are computed by <code>bench/gate.ts</code>.</li>
    {#each results.terminals.filter((t) => t.unverifiedTiming) as t (t.id)}<li><strong>{t.id} timings unverified:</strong> {t.unverifiedTiming}</li>{/each}
    <li>Bundle includes WASM, whether inlined or loaded as a separate file (ferroterm's 128 KB .wasm is counted).</li>
    <li>Heap is JS heap after a forced GC, measured after the scroll-flood run with the terminal still mounted.</li>
    <li>Wall time is end-marker visibility, sampled once per animation frame. Bundle size is esbuild minified + gzip -9 of the import, including WASM.</li>
    <li>CPU columns come from separate traced runs, so tracing never changes the wall-time, mount or heap samples. CPU is median renderer-main-thread task time from first write through marker visibility; script, layout and paint split that trace, and longest is the largest task. Frames counts animation-frame callbacks. CPU excludes worker and GPU work.</li>
    <li>Reproduce: <code>bun run bench 5</code> in <a href="https://github.com/acoyfellow/termlab/tree/main/bench">the repo</a>. Raw samples are in <code>src/lib/bench-results.json</code>.</li>
  </ul>
  <div class="excluded">
    <h3>Looked at, not benchmarked</h3>
    <ul>
      {#each excluded as e (e.name)}<li><a href={e.url}>{e.name}</a>: {e.reason}</li>{/each}
    </ul>
  </div>
</section>

<style>
  .results { background: #0a0a0a; border: 1px solid #222; border-radius: 8px; overflow: hidden; }
  .head { padding: 12px 14px 4px; }
  h2 { margin: 0; font-size: 15px; color: #f2efe8; font-weight: 600; }
  .head p { margin: 6px 0 8px; color: #a1a1aa; font-size: 12px; line-height: 1.5; max-width: 820px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; color: #d4d4d4; }
  th, td { border-top: 1px solid #1f1f1f; padding: 7px 10px; text-align: left; white-space: nowrap; font-weight: 400; }
  thead th { background: #111; color: #f2efe8; font-weight: 500; }
  tbody th { color: #f2efe8; font-weight: 500; }
  .mono { font-family: 'IBM Plex Mono', monospace; color: #a1a1aa; }
  .ratio { margin-left: 6px; color: #71717a; font-size: 11px; }
  td.best { color: #a3e635; }
  td.best .ratio { color: #a3e635; }
  td.unverified { color: #71717a; font-style: italic; }
  td.yes { color: #a3e635; }
  td.no { color: #f87171; }
  .cpu-breakdown { border-top: 1px solid #1f1f1f; }
  .cpu-breakdown h3 { padding: 10px 14px 0; }
  .cpu-breakdown td { vertical-align: top; }
  .cpu-breakdown .ratio { display: block; margin: 3px 0 0; }
  .notes { margin: 0; padding: 10px 14px 12px 30px; color: #a1a1aa; font-size: 11px; line-height: 1.6; border-top: 1px solid #1f1f1f; }
  .notes a, .excluded a { color: #d4d4d4; }
  .excluded { border-top: 1px solid #1f1f1f; padding: 10px 14px 12px; }
  h3 { margin: 0 0 4px; font-size: 12px; color: #f2efe8; font-weight: 600; }
  .excluded ul { margin: 0; padding-left: 16px; color: #a1a1aa; font-size: 11px; line-height: 1.6; }
  code { font-family: 'IBM Plex Mono', monospace; color: #d4d4d4; }
</style>
