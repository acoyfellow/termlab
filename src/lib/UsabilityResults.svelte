<script lang="ts">
  import usability from './usability-results.json';

  type Terminal = (typeof usability.terminals)[number];
  const rows = [...usability.terminals].sort((a, b) => b.passed - a.passed || a.id.localeCompare(b.id));
  const bestPassed = Math.max(...rows.map((terminal: Terminal) => terminal.passed));
</script>

<section aria-labelledby="usability-title">
  <h2 id="usability-title"><span>5</span> General usability</h2>
  <p>Automated {usability.cases.length}-case interactive typing, editing, IME, paste, selection and scrollback suite using default mount options in headless Chromium. Sorted highest first; shaded rows are the highest score.</p>
  <div class="table-wrap" tabindex="0" role="region" aria-label="General usability results">
    <table>
      <thead><tr><th>Terminal</th><th>Passed</th><th>Failed checks</th></tr></thead>
      <tbody>
        {#each rows as terminal (terminal.id)}
          <tr class:best={terminal.passed === bestPassed}>
            <th>{terminal.id} <small>{terminal.version}</small></th>
            <td>{terminal.passed}/{terminal.total}</td>
            <td>{terminal.failed.length ? terminal.failed.join(', ') : 'none'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <details>
    <summary>Usability test cases ({usability.cases.length})</summary>
    <ul>
      {#each usability.cases as item (item.id)}
        <li><code>{item.id}</code>: {item.name}</li>
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
