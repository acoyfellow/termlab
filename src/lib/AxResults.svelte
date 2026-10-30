<script lang="ts">
  import axResults from './ax-results.json';
  import adoption from './adopt-results.json';

  type AdoptionRun = (typeof adoption.results)[number];
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const adoptionRows = Object.entries(Object.groupBy(adoption.results, (run) => run.id)).map(([id, runs]) => {
    const values = runs as AdoptionRun[];
    return { id, passed: values.filter((run) => (run.markerInDom || run.writeWorks) && run.inputWorks).length, total: values.length, tokens: median(values.map((run) => run.tokens)) };
  }).sort((a, b) => b.passed / b.total - a.passed / a.total || a.tokens - b.tokens);
  const bestAdoption = adoptionRows[0];
  const readScore = (terminal: (typeof axResults.terminals)[number]) => terminal.reads.innerText.matched + terminal.reads.accessibility.matched + terminal.input.passed;
  const readRows = [...axResults.terminals].sort((a, b) => readScore(b) - readScore(a));
  const bestRead = Math.max(...readRows.map(readScore));
</script>

<section aria-labelledby="ax-title">
  <h2 id="ax-title"><span>4</span> Agent readability</h2>
  <p>Same-screen read checks, input checks, and zero-shot package adoption. Rows are sorted best first; shaded rows are the best result.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Terminal</th><th>innerText</th><th>a11y</th><th>Input</th><th>Tokens</th></tr></thead>
      <tbody>
        {#each readRows as terminal (terminal.id)}
          <tr class:best={readScore(terminal) === bestRead}>
            <th>{terminal.id}</th>
            <td>{terminal.reads.innerText.matched}/{terminal.reads.innerText.total}</td>
            <td>{terminal.reads.accessibility.matched}/{terminal.reads.accessibility.total}</td>
            <td>{terminal.input.passed}/{terminal.input.total}</td>
            <td>{terminal.reads.innerText.tokens}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <figure>
    <figcaption>Table 4. Zero-shot package adoption, {adoption.runs} runs per package.</figcaption>
    <table>
      <thead><tr><th>Terminal</th><th>Pass count</th><th>Median tokens</th></tr></thead>
      <tbody>{#each adoptionRows as row (row.id)}<tr class:best={row === bestAdoption}><th>{row.id}</th><td>{row.passed}/{row.total}</td><td>{Math.round(row.tokens / 1000)}k</td></tr>{/each}</tbody>
    </table>
  </figure>
  <details><summary>Agent-readability method</summary><p>Each terminal receives the same prompt, colours, CJK text, progress bar, and tabs. Canvas text is not page text. hterm runs inside an iframe; this harness does not read or type into iframes. Adoption uses a fresh agent with the installed package and README, then checks output and input forwarding in a browser.</p></details>
</section>

<style>
  section { margin-top: 30px; border-top: 1px solid #cfd4da; padding-top: 16px; } h2 { margin: 0 0 8px; color: #202831; font-size: 19px; font-weight: 600; } h2 span { color: #697582; font-weight: 500; margin-right: 8px; } p { color: #59636d; font-size: 13px; line-height: 1.5; margin: 0 0 10px; } .table-wrap { overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 12px; } th, td { border: 1px solid #d5dbe0; padding: 7px 8px; text-align: left; } thead { background: #eef1f3; color: #46515c; } tbody th { color: #26313b; font-weight: 600; } tr.best { background: #edf4fa; } tr.best > th, tr.best > td { color: #202831; } figure { margin: 17px 0 0; } figcaption { color: #35414d; font-size: 13px; font-weight: 600; margin-bottom: 7px; } details { margin-top: 12px; border: 1px solid #d5dbe0; padding: 8px 10px; } summary { color: #35414d; cursor: pointer; font-size: 13px; font-weight: 600; } details p { margin: 9px 0 0; }
</style>
