<script lang="ts">
  import conformance from './conformance-results.json';

  type Terminal = (typeof conformance.terminals)[number];
  const full = (terminal: Terminal) => terminal.tested === conformance.cases.length;
  const rows = [...conformance.terminals].sort((a, b) => Number(!full(a)) - Number(!full(b)) || b.passed - a.passed || a.id.localeCompare(b.id));
  const bestPassed = Math.max(...rows.filter(full).map((terminal) => terminal.passed));
</script>

<section aria-labelledby="conformance-title">
  <h2 id="conformance-title"><span>4</span> VT conformance</h2>
  <p>Automated {conformance.cases.length}-case VT100/xterm/Unicode suite run in isolated headless Chromium pages per test. Sorted highest first; shaded rows are the highest full score.</p>
  <div class="table-wrap" tabindex="0" role="region" aria-label="VT conformance results">
    <table>
      <thead><tr><th>Terminal</th><th>Passed</th><th>Failed checks</th></tr></thead>
      <tbody>
        {#each rows as terminal (terminal.id)}
          <tr class:best={full(terminal) && terminal.passed === bestPassed}>
            <th>{terminal.id} <small>{terminal.version}</small></th>
            <td>{terminal.passed}/{terminal.tested}{#if !full(terminal)} <small>(no screen API)</small>{/if}</td>
            <td>{terminal.failed.length ? terminal.failed.join(', ') : 'none'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <details>
    <summary>Conformance test cases ({conformance.cases.length})</summary>
    <ul>
      {#each conformance.cases as item (item.id)}
        <li><code>{item.id}</code> ({item.category}): {item.name}</li>
      {/each}
    </ul>
  </details>
</section>

<style>
  section { margin-top: 30px; border-top: 1px solid #cfd4da; padding-top: 16px; }
  h2 { margin: 0 0 8px; color: #202831; font-size: 19px; font-weight: 600; }
  h2 span { color: #697582; font-weight: 500; margin-right: 8px; }
  p { color: #59636d; font-size: 13px; line-height: 1.5; margin: 0 0 10px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d5dbe0; padding: 7px 8px; text-align: left; vertical-align: top; }
  thead { background: #eef1f3; color: #46515c; }
  tbody th { color: #26313b; font-weight: 600; }
  small { color: #65707b; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 400; }
  tr.best { background: #edf4fa; }
  tr.best > th, tr.best > td { color: #202831; }
  details { margin-top: 12px; border: 1px solid #d5dbe0; padding: 8px 10px; }
  summary { color: #35414d; cursor: pointer; font-size: 13px; font-weight: 600; }
  ul { margin: 10px 0 0; padding-left: 18px; color: #4e5963; font-size: 12px; line-height: 1.5; }
  code { font-family: ui-monospace, monospace; font-size: 11px; }
  @media (max-width: 600px) { th, td { padding: 6px 5px; } small { display: block; overflow-wrap: anywhere; } }
</style>
