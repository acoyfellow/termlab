<script lang="ts">
  import axResults from './ax-results.json';

  type AdoptionRun = { id: string; tokens: number; toolCalls: number; costUsd: number; markerInDom: boolean; writeWorks: boolean; inputWorks: boolean };
  type Adoption = { model: string; runs: number; generatedAt?: string; results: AdoptionRun[] };
  type Grade = 'good' | 'ok' | 'bad';

  const tokenBandPct = 5;
  const readableBandMs = 17;
  const adoptionFiles = import.meta.glob('./adopt-results.json', { eager: true }) as Record<string, { default: Adoption }>;
  const adoption = Object.values(adoptionFiles)[0]?.default;
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

  const domTerminals = axResults.terminals.filter((terminal) => !terminal.canvas);
  const readsCorrectly = domTerminals.filter((terminal) => terminal.reads.innerText.matched === terminal.reads.innerText.total);
  const lowestTokens = Math.min(...readsCorrectly.map((terminal) => terminal.reads.innerText.tokens));
  const readableTimes = domTerminals.map((terminal) => terminal.readableDomMs).filter((value): value is number => value != null);
  const fastestReadable = Math.min(...readableTimes);
  const bestA11y = Math.max(...domTerminals.map((terminal) => terminal.reads.accessibility.matched));

  const fraction = (matched: number, total: number): Grade => (matched === total ? 'good' : matched === 0 ? 'bad' : 'ok');
  const tokenGrade = (tokens: number, linesOk: boolean): Grade => (!linesOk ? 'ok' : tokens <= lowestTokens * (1 + tokenBandPct / 100) ? 'good' : tokens <= lowestTokens * 2 ? 'ok' : 'bad');
  const readableGrade = (ms: number | null): Grade => (ms == null ? 'bad' : ms <= fastestReadable + readableBandMs ? 'good' : 'ok');
  const a11yGrade = (matched: number, total: number): Grade => (matched === 0 ? 'bad' : matched >= bestA11y || matched === total ? 'good' : 'ok');
  const mark: Record<Grade, string> = { good: '✓', ok: '~', bad: '✗' };

  const adoptionRows = adoption
    ? Object.entries(Object.groupBy(adoption.results, (run) => run.id)).map(([id, runs]) => {
        const values = runs ?? [];
        const success = values.filter((run) => (run.markerInDom || run.writeWorks) && run.inputWorks).length;
        return { id, runs: values.length, success, tokens: median(values.map((run) => run.tokens)), toolCalls: median(values.map((run) => run.toolCalls)), cost: median(values.map((run) => run.costUsd)) };
      })
    : [];
  const reliable = adoptionRows.filter((row) => row.success === row.runs);
  const cheapestReliable = Math.min(...reliable.map((row) => row.tokens));
  const adoptionTokenGrade = (row: (typeof adoptionRows)[number]): Grade => (row.success !== row.runs ? 'bad' : row.tokens <= cheapestReliable * (1 + tokenBandPct / 100) ? 'good' : 'ok');

  const isSubject = (id: string) => id === 'cloudterm';
  const subject = axResults.terminals.find((terminal) => terminal.id === 'cloudterm');
  const cloudtermAdoption = adoptionRows.find((row) => row.id === 'cloudterm');
  const verdicts = subject && !subject.canvas
    ? [
        { label: 'Reads exactly', grade: fraction(subject.reads.innerText.matched, subject.reads.innerText.total) },
        { label: 'Screen-reader text', grade: a11yGrade(subject.reads.accessibility.matched, subject.reads.accessibility.total) },
        { label: 'Input', grade: fraction(subject.input.passed, subject.input.total) },
        { label: 'Read cost', grade: tokenGrade(subject.reads.innerText.tokens, subject.reads.innerText.matched === subject.reads.innerText.total) },
        { label: 'Readable fast', grade: readableGrade(subject.readableDomMs) },
        ...(cloudtermAdoption ? [{ label: 'Agent adoption', grade: adoptionTokenGrade(cloudtermAdoption) }] : []),
      ]
    : [];
</script>

<section class="ax-results" aria-labelledby="ax-title">
  <div class="head">
    <h2 id="ax-title">Agent experience (AX)</h2>
    <p>How well an agent can read, drive and adopt each terminal. Every terminal renders the same screen (prompt, colours, CJK, progress bar, tabs). <span class="good">✓</span> best or within the tie band, <span class="ok">~</span> works but behind, <span class="bad">✗</span> fails. Canvas terminals report text not in DOM because page text and screen readers cannot read their cells. The hterm rows are unverified: hterm renders inside an iframe, and this harness does not yet read or type into iframes.</p>
    {#if verdicts.length}
      <ul class="verdicts" aria-label="cloudterm AX verdicts">
        {#each verdicts as verdict (verdict.label)}
          <li class={verdict.grade}><span aria-hidden="true">{mark[verdict.grade]}</span> {verdict.label}</li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="scroll">
    <table>
      <thead><tr><th title="Terminal implementation">Terminal</th><th title="Expected screen lines found exactly in element innerText">innerText lines</th><th title="Approximate tokens an agent pays to read innerText; tick = within {tokenBandPct}% of the lowest among terminals that read every line">innerText tokens</th><th title="Expected screen lines found in the accessibility tree">a11y lines</th><th title="Time from write() until the end marker is readable in the DOM; tick = within {readableBandMs} ms of the fastest">readable ms</th><th title="Keyboard and paste input cases that produced exactly the right bytes">input</th></tr></thead>
      <tbody>
        {#each axResults.terminals as terminal (terminal.id)}
          <tr class:subject={isSubject(terminal.id)}>
            <th>{terminal.id}</th>
            {#if terminal.canvas}
              <td colspan="4" class="bad">✗ text not in DOM</td>
              <td class={fraction(terminal.input.passed, terminal.input.total)}>{mark[fraction(terminal.input.passed, terminal.input.total)]} {terminal.input.passed}/{terminal.input.total}</td>
            {:else}
              {@const lines = fraction(terminal.reads.innerText.matched, terminal.reads.innerText.total)}
              {@const tokens = tokenGrade(terminal.reads.innerText.tokens, terminal.reads.innerText.matched === terminal.reads.innerText.total)}
              {@const a11y = a11yGrade(terminal.reads.accessibility.matched, terminal.reads.accessibility.total)}
              {@const readable = readableGrade(terminal.readableDomMs)}
              {@const input = fraction(terminal.input.passed, terminal.input.total)}
              <td class={lines}>{mark[lines]} {terminal.reads.innerText.matched}/{terminal.reads.innerText.total}</td>
              <td class={tokens}>{mark[tokens]} {terminal.reads.innerText.tokens}</td>
              <td class={a11y}>{mark[a11y]} {terminal.reads.accessibility.matched}/{terminal.reads.accessibility.total}</td>
              <td class={readable}>{mark[readable]} {terminal.readableDomMs == null ? 'never' : `${terminal.readableDomMs.toFixed(1)} ms`}</td>
              <td class={input}>{mark[input]} {terminal.input.passed}/{terminal.input.total}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if adoption}
    <div class="adoption">
      <h3>Zero-shot adoption</h3>
      <p>A fresh agent ({adoption.model}) gets only the npm package and its README and must embed the terminal in a blank page that writes a marker and forwards input. {adoption.runs} runs per package; a headless browser checks each result. Pass/fail alone did not separate packages (a wrong-README control still passed), so median tokens is the comparison; tick = all runs pass and within {tokenBandPct}% of the cheapest reliable package.</p>
      <div class="scroll">
        <table>
          <thead><tr><th>Terminal</th><th title="Runs where the page wrote output and forwarded input">success</th><th title="Median agent tokens across runs">median tokens</th><th title="Median agent tool calls">median tool calls</th><th title="Median agent cost in US dollars">median cost</th></tr></thead>
          <tbody>
            {#each adoptionRows as row (row.id)}
              {@const ok = row.success === row.runs ? 'good' : row.success === 0 ? 'bad' : 'ok'}
              {@const tok = adoptionTokenGrade(row)}
              <tr class:subject={isSubject(row.id)}>
                <th>{row.id}</th>
                <td class={ok}>{mark[ok]} {row.success}/{row.runs}</td>
                <td class={tok}>{mark[tok]} {Math.round(row.tokens / 1000)}k</td>
                <td>{row.toolCalls}</td>
                <td>${row.cost.toFixed(3)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</section>

<style>
  .ax-results { margin-top: 16px; background: #0a0a0a; border: 1px solid #222; border-radius: 8px; overflow: hidden; }
  .head, .adoption { padding: 12px 14px 4px; }
  h2, h3 { margin: 0; color: #f2efe8; font-weight: 600; }
  h2 { font-size: 15px; } h3 { font-size: 12px; }
  p { margin: 6px 0 8px; color: #a1a1aa; font-size: 12px; line-height: 1.5; max-width: 820px; }
  .verdicts { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 4px 0 10px; padding: 0; }
  .verdicts li { border: 1px solid currentColor; border-radius: 999px; padding: 2px 9px; font-size: 11px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; color: #d4d4d4; }
  th, td { border-top: 1px solid #1f1f1f; padding: 7px 10px; text-align: left; white-space: nowrap; font-weight: 400; }
  thead th { background: #111; color: #f2efe8; font-weight: 500; } tbody th { color: #f2efe8; font-weight: 500; }
  tr.subject { background: #0f1a12; }
  .good { color: #4ade80; } .ok { color: #facc15; } .bad { color: #f87171; }
  .adoption { border-top: 1px solid #1f1f1f; padding-bottom: 8px; }
</style>
