<script lang="ts">
  import results from './bench-results.json';

  type Workload = keyof typeof results.workloads;
  const workloads = Object.keys(results.workloads) as Workload[];
  const labels: Record<Workload, string> = {
    'scroll-flood': 'Scroll flood',
    'full-redraw': 'Full redraw',
    'sgr-tokens': 'SGR tokens',
  };

  const best = (pick: (t: (typeof results.terminals)[number]) => number | null) =>
    Math.min(...results.terminals.map(pick).filter((v): v is number => v != null));
  const fastest = Object.fromEntries(workloads.map((w) => [w, best((t) => t.timings[w].medianMs)])) as Record<Workload, number>;
  const smallest = best((t) => t.gzipBytes);

  const ratio = (value: number | null, min: number) => (value == null ? '' : value === min ? 'best' : `${(value / min).toFixed(1)}×`);
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
  const date = new Date(results.generatedAt).toISOString().slice(0, 10);
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
              <td class:best={m === fastest[w]}>
                {m == null ? `${t.timings[w].failures} failed` : `${m} ms`}
                <span class="ratio">{ratio(m, fastest[w])}</span>
              </td>
            {/each}
            <td>{t.mountMs} ms</td>
            <td>{t.heapMB} MB</td>
            <td class:best={t.gzipBytes === smallest}>{kb(t.gzipBytes)}</td>
            <td class={t.textInDom ? 'yes' : 'no'}>{t.textInDom ? 'yes' : t.canvas ? 'no (canvas)' : 'no'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <ul class="notes">
    {#each workloads as w (w)}<li><strong>{labels[w]}:</strong> {results.workloads[w]}, {results.grid} grid, written in 16 KB chunks.</li>{/each}
    <li>Run {date} on {results.machine}, {results.browser}. WebGL runs on {results.gpu}, so the xterm.js WebGL row understates a real GPU.</li>
    <li>Timings are frame-quantized (~16.7 ms), so values within one frame are a tie. Bundle size is esbuild minified + gzip -9 of the import, including WASM.</li>
    <li>Reproduce: <code>bun run bench 5</code> in <a href="https://github.com/acoyfellow/termlab/tree/main/bench">the repo</a>. Raw samples are in <code>src/lib/bench-results.json</code>.</li>
  </ul>
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
  td.yes { color: #a3e635; }
  td.no { color: #f87171; }
  .notes { margin: 0; padding: 10px 14px 12px 30px; color: #a1a1aa; font-size: 11px; line-height: 1.6; border-top: 1px solid #1f1f1f; }
  .notes a { color: #d4d4d4; }
  code { font-family: 'IBM Plex Mono', monospace; color: #d4d4d4; }
</style>
