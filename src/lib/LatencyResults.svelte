<script lang="ts">
  import latency from './latency-results.json';

  type Terminal = (typeof latency.terminals)[number];
  const valid = (terminal: Terminal) =>
    !terminal.unverifiedTiming &&
    terminal.clean.failures === 0 &&
    typeof terminal.clean.displayMedianMs === 'number';
  const rows = [...latency.terminals].sort(
    (a, b) =>
      Number(!valid(a)) - Number(!valid(b)) ||
      (a.clean.displayMedianMs ?? Infinity) - (b.clean.displayMedianMs ?? Infinity),
  );
  const lowestClean = Math.min(...rows.filter(valid).map((t) => t.clean.displayMedianMs!));
  const fmt = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n * 10) / 10}` : '—');
</script>

<section aria-labelledby="latency-title">
  <h2 id="latency-title"><span>6</span> Input-to-display latency</h2>
  <p>{latency.keysPerMode} individual keystrokes spaced across frame phases (local echo), measured from browser <code>keydown</code> to the Chrome trace frame <code>Commit</code> that paints the character — both on a clean screen and with 5,000 lines of scrollback. Lower is faster; shaded row is lowest verified median.</p>
  <div class="table-wrap" tabindex="0" role="region" aria-label="Input-to-display latency results">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Terminal</th>
          <th>Clean median (ms)</th>
          <th>Clean p95 (ms)</th>
          <th>5k scrollback (ms)</th>
          <th>CPU/key (ms)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as terminal (terminal.id)}
          {@const ok = valid(terminal)}
          {@const isLowest = ok && Math.abs(terminal.clean.displayMedianMs! - lowestClean) < 0.05}
          <tr class:lowest={isLowest}>
            <td>{ok ? 1 + rows.filter((other) => valid(other) && other.clean.displayMedianMs! < terminal.clean.displayMedianMs! - 0.05).length : '—'}</td>
            <th>{terminal.id} <small>{terminal.version}</small></th>
            <td>{fmt(terminal.clean.displayMedianMs)}</td>
            <td>{fmt(terminal.clean.displayP95Ms)}</td>
            <td>{fmt(terminal.scrollback5k.displayMedianMs)}</td>
            <td>{fmt(terminal.clean.keyCpuMedianMs)} / {fmt(terminal.scrollback5k.keyCpuMedianMs)}</td>
            <td>{terminal.unverifiedTiming ? 'unverified' : ok ? (isLowest ? 'lowest' : 'verified') : 'failed'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  section { margin-top: 30px; border-top: 1px solid #cfd4da; padding-top: 16px; }
  h2 { margin: 0 0 8px; color: #202831; font-size: 19px; font-weight: 600; }
  h2 span { color: #697582; font-weight: 500; margin-right: 8px; }
  p { color: #59636d; font-size: 13px; line-height: 1.5; margin: 0 0 10px; }
  code { font-family: ui-monospace, monospace; font-size: 11px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d5dbe0; padding: 7px 8px; text-align: left; vertical-align: middle; white-space: nowrap; }
  tbody th { white-space: normal; color: #26313b; font-weight: 600; }
  thead { background: #eef1f3; color: #46515c; }
  small { color: #525d68; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 400; }
  tbody tr.lowest { background: #edf4fa; }
  tr.lowest > th, tr.lowest > td { color: #202831; }
  tr.lowest small { color: #3c4752; }
  @media (max-width: 600px) { th, td { padding: 6px 5px; } small { display: block; overflow-wrap: anywhere; } }
</style>
