<script lang="ts">
  import { BENCH_ROWS, STATIC_GRADES, type BenchResult } from './benchmark';
  import { ADAPTERS } from './adapters';

  let {
    liveMeasurements,
  }: {
    /**
     * Runtime-measured stats keyed by adapter id → bench row key.
     * TerminalCell writes into this as it mounts.
     */
    liveMeasurements: Record<string, Record<string, { value: string; result: BenchResult }>>;
  } = $props();

  // Build rendered cells: merge static grades + live measurements
  function cellFor(adapterId: string, rowKey: string) {
    const live = liveMeasurements[adapterId]?.[rowKey];
    if (live) return live;
    const staticGrade = STATIC_GRADES[adapterId]?.[rowKey];
    if (staticGrade) {
      return {
        value: staticGrade.note ?? formatResult(staticGrade.result),
        result: staticGrade.result,
      };
    }
    return { value: '—', result: 'unknown' as BenchResult };
  }

  function formatResult(r: BenchResult) {
    return r === 'pass' ? '✓' : r === 'fail' ? '✗' : r === 'partial' ? '~' : '?';
  }

  function classFor(result: BenchResult) {
    return `r-${result}`;
  }
</script>

<section class="matrix" aria-label="Benchmark matrix">
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th class="sticky">Benchmark</th>
          {#each ADAPTERS as a (a.id)}
            <th>{a.label}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each BENCH_ROWS as row (row.key)}
          <tr>
            <th class="sticky" title={row.description}>
              <div class="row-label">{row.label}</div>
              {#if row.measured}<span class="measured-tag">measured</span>{/if}
            </th>
            {#each ADAPTERS as a (a.id)}
              {@const cell = cellFor(a.id, row.key)}
              <td class={classFor(cell.result)} title={row.description}>
                {cell.value}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="legend">
    <span class="r-pass">✓ pass</span>
    <span class="r-partial">~ partial</span>
    <span class="r-fail">✗ fail</span>
    <span class="r-unknown">? unknown</span>
  </div>
</section>

<style>
  .matrix {
    background: #0a0a0a;
    border: 1px solid #222;
    border-radius: 8px;
    overflow: hidden;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12px;
    color: #d4d4d4;
  }
  th,
  td {
    border-bottom: 1px solid #1f1f1f;
    border-right: 1px solid #1f1f1f;
    padding: 8px 10px;
    text-align: left;
    white-space: nowrap;
    font-weight: 400;
  }
  th {
    background: #111;
    color: #f2efe8;
    font-weight: 500;
  }
  th.sticky {
    position: sticky;
    left: 0;
    background: #111;
    z-index: 2;
    min-width: 180px;
  }
  tbody tr:hover td,
  tbody tr:hover th {
    background: #161616;
  }
  .row-label {
    font-size: 12px;
  }
  .measured-tag {
    display: inline-block;
    margin-top: 2px;
    font-size: 10px;
    color: #888;
    font-family: 'IBM Plex Mono', monospace;
  }
  td.r-pass {
    color: #a3e635;
  }
  td.r-partial {
    color: #fbbf24;
  }
  td.r-fail {
    color: #f87171;
  }
  td.r-unknown {
    color: #666;
  }
  .legend {
    display: flex;
    gap: 12px;
    padding: 6px 12px;
    background: #0a0a0a;
    border-top: 1px solid #1f1f1f;
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
  }
  .legend .r-pass {
    color: #a3e635;
  }
  .legend .r-partial {
    color: #fbbf24;
  }
  .legend .r-fail {
    color: #f87171;
  }
  .legend .r-unknown {
    color: #666;
  }
</style>
