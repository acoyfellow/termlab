<script lang="ts">
  import AxResults from './AxResults.svelte';
  import ConformanceResults from './ConformanceResults.svelte';
  import LatencyResults from './LatencyResults.svelte';
  import UsabilityResults from './UsabilityResults.svelte';
  import conformance from './conformance-results.json';
  import latency from './latency-results.json';
  import usability from './usability-results.json';
  import results from './bench-results.json';

  type Workload = keyof typeof results.workloads;
  type Terminal = (typeof results.terminals)[number];
  type Timing = Terminal['timings'][Workload];

  const workloads = Object.keys(results.workloads) as Workload[];
  const labels = results.workloadLabels as Record<Workload, string>;
  const kinds = results.workloadKinds as Record<Workload, string>;
  const date = new Date(results.generatedAt).toISOString().slice(0, 10);
  const verified = (terminal: Terminal) => !terminal.unverifiedTiming;
  const confById = Object.fromEntries(conformance.terminals.map((terminal) => [terminal.id, terminal]));
  const eligible = (terminal: Terminal, workload: Workload) =>
    verified(terminal) && !(workload === 'resize-reflow' && confById[terminal.id]?.cases['resize-reflow']?.pass === false);
  const ineligibleReason = (terminal: Terminal, workload: Workload) => {
    if (terminal.unverifiedTiming) return 'unverified';
    if (workload === 'resize-reflow' && confById[terminal.id]?.cases['resize-reflow']?.pass === false) return 'no reflow';
    return null;
  };
  const cpuOf = (timing: Timing) => timing.cpuMs?.medianMs ?? timing.medianMs ?? Infinity;
  const drawOf = (timing: Timing) => {
    const lay = timing.styleLayoutMs?.medianMs ?? 0;
    const paint = timing.paintMs?.medianMs ?? 0;
    return Math.round((lay + paint) * 10) / 10;
  };
  const fmt = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n * 10) / 10}` : '—');
  const lowestCpu = (workload: Workload) => Math.min(...results.terminals.filter((terminal) => eligible(terminal, workload)).map((terminal) => cpuOf(terminal.timings[workload])));
  const verifiedLows = Object.fromEntries(workloads.map((workload) => [workload, lowestCpu(workload)])) as Record<Workload, number>;
  const ratio = (value: number, minimum: number) => `${(value / minimum).toFixed(1)}×`;
  const cloudterm = results.terminals.find((terminal) => terminal.id === 'cloudterm')!;
  const cloudtermConf = confById['cloudterm'];
  const cloudtermUse = usability.terminals.find((terminal) => terminal.id === 'cloudterm');
  const cloudtermLat = latency.terminals.find((terminal) => terminal.id === 'cloudterm');
  const leaders = (workload: Workload) =>
    results.terminals
      .filter((terminal) => eligible(terminal, workload) && Math.abs(cpuOf(terminal.timings[workload]) - verifiedLows[workload]) < 0.05)
      .map((terminal) => `${terminal.id} ${terminal.version}`)
      .join(' and ');
  const eligibleCount = (workload: Workload) => results.terminals.filter((terminal) => eligible(terminal, workload)).length;
  const cloudtermRank = (workload: Workload) =>
    1 + results.terminals.filter((terminal) => eligible(terminal, workload) && cpuOf(terminal.timings[workload]) < cpuOf(cloudterm.timings[workload])).length;
  const verifiedCount = results.terminals.filter(verified).length;
  const ranked = (workload: Workload) =>
    [...results.terminals].sort((a, b) => Number(!eligible(a, workload)) - Number(!eligible(b, workload)) || cpuOf(a.timings[workload]) - cpuOf(b.timings[workload]));
  const maxCpu = (workload: Workload) => Math.max(...results.terminals.map((item) => {
    const v = cpuOf(item.timings[workload]);
    return Number.isFinite(v) ? v : 0;
  }));
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
    <p class="verdict-meta">cloudterm {cloudterm.version}: mount {cloudterm.mountMs} ms, {Math.round(cloudterm.gzipBytes / 1024)} KB gz, {cloudterm.heapMB} MB heap{#if cloudtermConf}, VT {cloudtermConf.passed}/{cloudtermConf.tested}{/if}{#if cloudtermUse}, usability {cloudtermUse.passed}/{cloudtermUse.total}{/if}{#if cloudtermLat?.clean.displayMedianMs}, key latency {Math.round(cloudtermLat.clean.displayMedianMs)} ms{/if}. Ranked by main-thread CPU across {verifiedCount} verified terminals ({results.terminals.length} tested).</p>
    <ol>
      {#each workloads as workload (workload)}
        {@const ct = cloudterm.timings[workload]}
        {@const ctReason = ineligibleReason(cloudterm, workload)}
        <li>{labels[workload]}: lowest CPU {leaders(workload)} ({fmt(verifiedLows[workload])} ms); cloudterm {fmt(cpuOf(ct))} ms CPU / {ct.medianMs} ms wall ({ctReason ? `unranked: ${ctReason}` : `#${cloudtermRank(workload)}/${eligibleCount(workload)}`}).</li>
      {/each}
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
    <div><dt>Rounds</dt><dd>{results.rounds} untraced + {results.rounds} traced</dd></div>
    <div><dt>Grid & scrollback</dt><dd>{results.grid}, {results.scrollback.toLocaleString()} lines</dd></div>
    <div><dt>Terminals tested</dt><dd>{results.terminals.length}</dd></div>
    <div><dt>Primary metric</dt><dd>Main-thread CPU ms (parse + layout + paint)</dd></div>
  </dl>
  <p>Each sample runs in a fresh headless Chromium with alternating order per round. Tables rank by traced main-thread CPU (from start through 2 settle frames) because wall time quantizes to 16.7 ms refresh steps. Each terminal’s completion probe (DOM, buffer, snapshot, or search) is listed beside its timing.</p>
</section>

<section class="results" aria-labelledby="results-title">
  <h2 id="results-title"><span>3</span> Performance results</h2>
  {#each workloads as workload, tableNumber (workload)}
    {@const minimum = verifiedLows[workload]}
    {@const isPaced = kinds[workload] === 'paced'}
    {@const peak = maxCpu(workload)}
    <figure>
      <figcaption>Table {tableNumber + 1}. {labels[workload]} — ranked by main-thread CPU ms ({results.rounds} rounds). Lower is faster; shaded row is lowest verified CPU.</figcaption>
      <p class="workload-detail">{results.workloads[workload]}</p>
      <div class="table-wrap" tabindex="0" role="region" aria-label={`${labels[workload]} results`}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Terminal</th>
              <th>CPU (ms)</th>
              <th>Draw (ms)</th>
              {#if isPaced}
                <th>p95 / drops</th>
              {:else}
                <th>Wall (ms)</th>
              {/if}
              <th>vs lowest</th>
              <th>Probe</th>
            </tr>
          </thead>
          <tbody>
            {#each ranked(workload) as terminal (terminal.id)}
              {@const timing = terminal.timings[workload]}
              {@const cpu = cpuOf(timing)}
              {@const reason = ineligibleReason(terminal, workload)}
              {@const isLowest = !reason && Math.abs(cpu - minimum) < 0.05}
              <tr class:lowest={isLowest}>
                <td>{reason ? '—' : 1 + results.terminals.filter((other) => eligible(other, workload) && cpuOf(other.timings[workload]) < cpu - 0.05).length}</td>
                <th>{terminal.id} <small>{terminal.version}{#if terminal.grid !== results.grid} · {terminal.grid}{/if}</small></th>
                <td><span class="bar" style={`--bar: ${peak ? Math.max(4, (cpu / peak) * 100) : 4}%`}></span>{fmt(timing.cpuMs?.medianMs)}</td>
                <td>{fmt(drawOf(timing))}</td>
                {#if isPaced}
                  <td>{fmt(timing.p95FrameMs)} / {timing.droppedFrames ?? '—'} <small>({timing.medianMs}w)</small></td>
                {:else}
                  <td>{timing.medianMs ?? '—'}</td>
                {/if}
                <td>{reason ? '—' : ratio(cpu, minimum)}</td>
                <td>{reason ?? terminal.probe}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </figure>
  {/each}
</section>

<ConformanceResults />

<UsabilityResults />

<LatencyResults />

<AxResults />

<section class="notes" aria-labelledby="notes-title">
  <h2 id="notes-title"><span>8</span> Limitations and notes</h2>
  <ol>
    <li><strong>Main-thread CPU vs wall time:</strong> Wall time snaps to ~16.7 ms animation-frame steps. Traced main-thread CPU (including layout and paint through 2 settle frames) is the continuous signal; worker and GPU thread time are excluded.</li>
    <li><strong>Probe differences:</strong> <code>dom</code> probes wait for painted DOM text; <code>snapshot</code> waits for rendered frame snapshots; <code>buffer</code> reads the terminal buffer plus 2 settle frames; <code>search</code> (restty) can resolve before painting and is marked unverified.</li>
    <li><strong>Resize + reflow honesty:</strong> Terminals that truncate/pad instead of reflowing (see VT conformance section 4) do less CPU work on the resize workload. Read speed alongside conformance.</li>
    <li><strong>Heap and bundle:</strong> Heap is JS heap after forced GC following scroll flood. Bundle size is minified ESM + gzip including WASM.</li>
  </ol>
  <details><summary>Benchmark conditions and implementation notes</summary><ul>
    {#each workloads as workload (workload)}<li>{labels[workload]}: {results.workloads[workload]}, {results.grid} grid, {results.scrollback.toLocaleString()}-line scrollback.</li>{/each}
    <li>restty mount includes CDN font download. ferroterm, auterm, hterm upstream, and T3 Code are source builds recorded in <a href="https://github.com/acoyfellow/termlab/blob/main/vendor/SOURCES.md">vendor/SOURCES.md</a>.</li>
    <li>wterm (webgl) paints live frames on WebGL2 and syncs DOM text 150 ms after output goes idle.</li>
  </ul></details>
</section>

<section class="excluded" aria-labelledby="excluded-title">
  <h2 id="excluded-title"><span>9</span> Excluded terminals</h2>
  <ol>{#each excluded as terminal (terminal.name)}<li><a href={terminal.url}>{terminal.name}</a>: {terminal.reason}</li>{/each}</ol>
</section>

<style>
  section { margin-top: 30px; } h2 { color: #202831; font-size: 19px; font-weight: 600; margin: 0 0 10px; } h2 span { color: #697582; font-weight: 500; margin-right: 8px; }
  .summary { border-top: 1px solid #aeb7c0; border-bottom: 1px solid #cfd4da; padding: 10px 0; color: #28323c; font-size: 13px; line-height: 1.45; } .verdict-meta { margin: 0 0 8px; font-weight: 500; } ol { margin: 0; padding-left: 21px; } li + li { margin-top: 5px; }
  .method { border-top: 1px solid #cfd4da; padding-top: 16px; } dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border: 1px solid #cfd4da; } dl div { display: grid; grid-template-columns: 125px 1fr; border-bottom: 1px solid #dce1e5; } dl div:nth-last-child(-n+2) { border-bottom: 0; } dt, dd { margin: 0; padding: 7px 9px; font-size: 12px; line-height: 1.35; } dt { background: #f0f2f4; color: #57616b; font-weight: 600; } dd { color: #29323b; } .method > p, .workload-detail { color: #59636d; font-size: 12px; line-height: 1.5; }
  figure { margin: 18px 0 0; } figcaption { color: #35414d; font-size: 13px; font-weight: 600; } .workload-detail { margin: 4px 0 7px; } .table-wrap { overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 12px; } th, td { border: 1px solid #d5dbe0; padding: 7px 8px; text-align: left; vertical-align: middle; white-space: nowrap; } tbody th { white-space: normal; color: #26313b; font-weight: 600; } thead { background: #eef1f3; color: #46515c; } tbody tr.lowest { background: #edf4fa; } small { color: #65707b; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 400; } tr.lowest > th, tr.lowest > td { color: #202831; } .bar { display: inline-block; width: var(--bar); max-width: 44px; height: 5px; margin: 0 6px 1px 0; background: #aeb7c0; } .lowest .bar { background: #4f82a7; }
  .notes, .excluded { border-top: 1px solid #cfd4da; padding-top: 16px; color: #4e5963; font-size: 13px; line-height: 1.5; } details { margin-top: 12px; border: 1px solid #d5dbe0; padding: 8px 10px; } summary { color: #35414d; cursor: pointer; font-weight: 600; } details ul { margin: 10px 0 0; padding-left: 18px; } a { color: #315f82; } code { font-family: ui-monospace, monospace; font-size: 11px; }
  @media (max-width: 600px) { dl { grid-template-columns: 1fr; } dl div { grid-template-columns: 104px 1fr; } dl div:not(:last-child) { border-bottom: 1px solid #dce1e5; } th, td { padding: 6px 5px; } small { display: block; overflow-wrap: anywhere; } }
</style>
