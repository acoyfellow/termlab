<script lang="ts">
  import axResults from './ax-results.json';

  type AdoptionRun = { id: string; tokens: number; toolCalls: number; costUsd: number; markerInDom: boolean; writeWorks: boolean; inputWorks: boolean };
  type Adoption = { model: string; runs: number; results: AdoptionRun[] };
  const adoptionFiles = import.meta.glob('./adopt-results.json', { eager: true }) as Record<string, { default: Adoption }>;
  const adoption = Object.values(adoptionFiles)[0]?.default;
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const adoptionRows = adoption ? Object.entries(Object.groupBy(adoption.results, (run) => run.id)).map(([id, runs]) => {
    const values = runs ?? [];
    return { id, runs: values.length, success: values.filter((run) => (run.markerInDom || run.writeWorks) && run.inputWorks).length, tokens: median(values.map((run) => run.tokens)), toolCalls: median(values.map((run) => run.toolCalls)), cost: median(values.map((run) => run.costUsd)) };
  }) : [];
</script>

<section class="ax-results" aria-labelledby="ax-title">
  <div class="head">
    <h2 id="ax-title">Agent experience (AX)</h2>
    <p>Browser-readable terminal output and input are measured after rendering the same screen. Canvas terminals report text not in DOM because page text and screen readers cannot read their cells.</p>
  </div>
  <div class="scroll">
    <table>
      <thead><tr><th title="Terminal implementation">Terminal</th><th title="Expected screen lines found in element innerText">innerText lines</th><th title="Approximate tokens required to represent the innerText">innerText tokens</th><th title="Expected screen lines found in the accessibility tree">a11y lines</th><th title="Time until the marker is readable through the DOM">readable ms</th><th title="Keyboard and paste input cases accepted">input</th></tr></thead>
      <tbody>
        {#each axResults.terminals as terminal (terminal.id)}
          <tr>
            <th>{terminal.id}</th>
            {#if terminal.canvas}
              <td colspan="5" class="canvas">text not in DOM</td>
            {:else}
              <td>{terminal.reads.innerText.matched}/{terminal.reads.innerText.total}</td>
              <td>{terminal.reads.innerText.tokens}</td>
              <td>{terminal.reads.accessibility.matched}/{terminal.reads.accessibility.total}</td>
              <td>{terminal.readableDomMs == null ? 'n/a' : `${terminal.readableDomMs.toFixed(1)} ms`}</td>
              <td>{terminal.input.passed}/{terminal.input.total}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if adoption}
    <div class="adoption">
      <h3>Zero-shot adoption</h3>
      <p>One model ({adoption.model}) attempted {adoption.runs} runs per terminal. The dry-run pass/fail check did not separate terminals: a wrong-README control also passed, so tokens are the comparative measure.</p>
      <div class="scroll"><table><thead><tr><th title="Terminal package">Terminal</th><th title="Completed agent runs">runs</th><th title="Runs with a usable write path and input">success</th><th title="Median agent tokens">median tokens</th><th title="Median agent tool calls">median tool calls</th><th title="Median agent cost in US dollars">median cost</th></tr></thead><tbody>{#each adoptionRows as row (row.id)}<tr><th>{row.id}</th><td>{row.runs}</td><td>{row.success}/{row.runs}</td><td>{row.tokens}</td><td>{row.toolCalls}</td><td>${row.cost.toFixed(3)}</td></tr>{/each}</tbody></table></div>
    </div>
  {/if}
</section>

<style>
  .ax-results { margin-top: 16px; background: #0a0a0a; border: 1px solid #222; border-radius: 8px; overflow: hidden; }
  .head, .adoption { padding: 12px 14px 4px; }
  h2, h3 { margin: 0; color: #f2efe8; font-weight: 600; }
  h2 { font-size: 15px; } h3 { font-size: 12px; }
  p { margin: 6px 0 8px; color: #a1a1aa; font-size: 12px; line-height: 1.5; max-width: 820px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; color: #d4d4d4; }
  th, td { border-top: 1px solid #1f1f1f; padding: 7px 10px; text-align: left; white-space: nowrap; font-weight: 400; }
  thead th { background: #111; color: #f2efe8; font-weight: 500; } tbody th { color: #f2efe8; font-weight: 500; }
  .canvas { color: #f87171; font-style: italic; }
  .adoption { border-top: 1px solid #1f1f1f; padding-bottom: 8px; }
</style>
