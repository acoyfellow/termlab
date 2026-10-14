<script lang="ts">
  import AxResults from './AxResults.svelte';
  import results from './bench-results.json';

  type Workload = keyof typeof results.workloads;
  type Terminal = (typeof results.terminals)[number];
  const workloads = Object.keys(results.workloads) as Workload[];
  const labels: Record<Workload, string> = { 'scroll-flood': 'Scroll flood', 'full-redraw': 'Full redraw', 'sgr-tokens': 'SGR tokens' };
  const date = new Date(results.generatedAt).toISOString().slice(0, 10);
  const verified = (terminal: Terminal) => !terminal.unverifiedTiming;
  const lowest = (workload: Workload) => Math.min(...results.terminals.filter(verified).map((terminal) => terminal.timings[workload].medianMs));
  const ratio = (value: number, minimum: number) => `${(value / minimum).toFixed(1)}×`;
  const cloudterm = results.terminals.find((terminal) => terminal.id === 'cloudterm')!;
  const verifiedLows = Object.fromEntries(workloads.map((workload) => [workload, lowest(workload)])) as Record<Workload, number>;
  const withinFrame = workloads.filter((workload) => cloudterm.timings[workload].medianMs - verifiedLows[workload] <= 17).length;
  const excluded = [
    { name: 'xterm.js + canvas', url: 'https://www.npmjs.com/package/@xterm/addon-canvas', reason: 'addon-canvas declares a peer dependency on xterm 5; its timing beside xterm 6 would not be like-for-like.' },
    { name: 'beamterm', url: 'https://github.com/junkdog/beamterm', reason: 'a WebGL2 cell renderer with no VT/ANSI parser; these workloads do not apply.' },
    { name: 'SwiftTerm (WASM)', url: 'https://github.com/migueldeicaza/SwiftTerm', reason: 'its browser engine requires the pinned Swift toolchain and WASM SDK; it is not built.' },
    { name: 'frankenterm', url: 'https://github.com/Dicklesworthstone/frankenterm', reason: 'a Rust terminal hypervisor with an HTTP/SSE API; it has no browser renderer.' },
    { name: 'browstty', url: 'https://github.com/Snoupix/browstty', reason: 'a libghostty WASM playground, with no terminal component.' },
    { name: 'jquery.terminal', url: 'https://github.com/jcubic/jquery.terminal', reason: 'a command-line widget for web apps, not a VT emulator.' },
  ];
</script>

<section aria-labelledby="summary-title">
  <h2 id="summary-title"><span>1</span> Summary of findings</h2>
  <div class="summary" data-verdict>
    <ol>
      <li>cloudterm {cloudterm.version} is within 17 ms of the lowest verified median on {withinFrame}/{workloads.length} workload measures: {#each workloads as workload, index}{cloudterm.timings[workload].medianMs} ms {labels[workload].toLowerCase()}{index < workloads.length - 1 ? '; ' : '.'}{/each}</li>
      <li>cloudterm mount time is {cloudterm.mountMs} ms. Its bundle is {Math.round(cloudterm.gzipBytes / 1024)} KB gzip and its heap measurement is {cloudterm.heapMB} MB.</li>
      <li>Measured terminal count: {results.terminals.length}. One terminal has unverified timing status.</li>
    </ol>
  </div>
</section>

<section class="method" aria-labelledby="method-title">
  <h2 id="method-title"><span>2</span> Method</h2>
  <dl>
    <div><dt>Date</dt><dd>{date}</dd></div>
    <div><dt>Browser</dt><dd>{results.browser}</dd></div>
    <div><dt>GPU</dt><dd>{results.gpu}</dd></div>
    <div><dt>Machine</dt><dd>{results.machine}</dd></div>
    <div><dt>Rounds</dt><dd>{results.rounds}</dd></div>
    <div><dt>Grid size</dt><dd>{results.grid}</dd></div>
    <div><dt>Terminals tested</dt><dd>{results.terminals.length}</dd></div>
  </dl>
  <p>Each sample uses a fresh headless Chromium. Terminal order alternates per round. The timer stops after the end marker is visible following a painted frame. Lower times are lower medians.</p>
</section>

<section class="results" aria-labelledby="results-title">
  <h2 id="results-title"><span>3</span> Results</h2>
  {#each workloads as workload, tableNumber (workload)}
    {@const minimum = verifiedLows[workload]}
    <figure>
      <figcaption>Table {tableNumber + 1}. {labels[workload]} median wall time, ms, {results.rounds} rounds. Lower is lower.</figcaption>
      <p class="workload-detail">{results.workloads[workload]}</p>
      <table>
        <thead><tr><th>Terminal</th><th>Median (ms)</th><th>vs lowest (×)</th><th>Status</th></tr></thead>
        <tbody>
          {#each results.terminals as terminal (terminal.id)}
            {@const time = terminal.timings[workload].medianMs}
            <tr class:cloudterm={terminal.id === 'cloudterm'}>
              <th>{terminal.id} <small>{terminal.version}</small></th>
              <td><span class="bar" style={`--bar: ${Math.max(4, (time / Math.max(...results.terminals.map((item) => item.timings[workload].medianMs))) * 100)}%`}></span>{time}</td>
              <td>{terminal.unverifiedTiming ? '—' : ratio(time, minimum)}</td>
              <td>{terminal.unverifiedTiming ? 'unverified' : time === minimum ? 'lowest' : 'verified'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </figure>
  {/each}
</section>

<AxResults />

<section class="notes" aria-labelledby="notes-title">
  <h2 id="notes-title"><span>5</span> Limitations and notes</h2>
  <ol>
    <li>“Text in DOM” means the end marker is readable as page text for find, selection, and screen readers.</li>
    <li>Wall time is end-marker visibility sampled once per animation frame. Bundle size is minified import output plus gzip, including WASM.</li>
    <li>Heap is JavaScript heap after forced collection, following the scroll-flood run while the terminal remains mounted.</li>
  </ol>
  <details><summary>Benchmark conditions and implementation notes</summary><ul>
    {#each workloads as workload (workload)}<li>{labels[workload]}: {results.workloads[workload]}, {results.grid} grid, written in chunks.</li>{/each}
    <li>restty mount includes CDN font download. ferroterm, auterm, and hterm upstream are source builds recorded in <a href="https://github.com/acoyfellow/termlab/blob/main/vendor/SOURCES.md">vendor/SOURCES.md</a>.</li>
    <li>CPU traces are separate from wall-time samples. They report renderer main-thread task time; worker and GPU work are excluded.</li>
    <li>restty timing is unverified because its search API can resolve before output is painted.</li>
  </ul></details>
</section>

<section class="excluded" aria-labelledby="excluded-title">
  <h2 id="excluded-title"><span>6</span> Excluded terminals</h2>
  <ol>{#each excluded as terminal (terminal.name)}<li><a href={terminal.url}>{terminal.name}</a>: {terminal.reason}</li>{/each}</ol>
</section>

<style>
  section { margin-top: 30px; } h2 { color: #202831; font-size: 19px; font-weight: 600; margin: 0 0 10px; } h2 span { color: #697582; font-weight: 500; margin-right: 8px; }
  .summary { border-top: 1px solid #aeb7c0; border-bottom: 1px solid #cfd4da; padding: 12px 0; color: #28323c; font-size: 14px; line-height: 1.55; } ol { margin: 0; padding-left: 23px; } li + li { margin-top: 7px; }
  .method { border-top: 1px solid #cfd4da; padding-top: 16px; } dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border: 1px solid #cfd4da; } dl div { display: grid; grid-template-columns: 115px 1fr; border-bottom: 1px solid #dce1e5; } dl div:nth-last-child(-n+1) { border-bottom: 0; } dt, dd { margin: 0; padding: 7px 9px; font-size: 12px; line-height: 1.35; } dt { background: #f0f2f4; color: #57616b; font-weight: 600; } dd { color: #29323b; } .method > p, .workload-detail { color: #59636d; font-size: 12px; line-height: 1.5; }
  figure { margin: 18px 0 0; } figcaption { color: #35414d; font-size: 13px; font-weight: 600; } .workload-detail { margin: 4px 0 7px; } table { width: 100%; border-collapse: collapse; font-size: 12px; } th, td { border: 1px solid #d5dbe0; padding: 7px 8px; text-align: left; vertical-align: middle; } thead { background: #eef1f3; color: #46515c; } tbody th { color: #26313b; font-weight: 600; } tbody tr.cloudterm { background: #edf4fa; } small { color: #65707b; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 400; } tr.cloudterm > th, tr.cloudterm > td { color: #202831; } .bar { display: inline-block; width: var(--bar); max-width: 48px; height: 5px; margin: 0 6px 1px 0; background: #aeb7c0; } .cloudterm .bar { background: #4f82a7; }
  .notes, .excluded { border-top: 1px solid #cfd4da; padding-top: 16px; color: #4e5963; font-size: 13px; line-height: 1.5; } details { margin-top: 12px; border: 1px solid #d5dbe0; padding: 8px 10px; } summary { color: #35414d; cursor: pointer; font-weight: 600; } details ul { margin: 10px 0 0; padding-left: 18px; } a { color: #315f82; }
  @media (max-width: 600px) { dl { grid-template-columns: 1fr; } dl div { grid-template-columns: 96px 1fr; } dl div:not(:last-child) { border-bottom: 1px solid #dce1e5; } .results { overflow: hidden; } th, td { padding: 6px 5px; } small { display: block; overflow-wrap: anywhere; } }
</style>
