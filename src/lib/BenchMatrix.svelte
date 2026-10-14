<script lang="ts">
  import { BENCH_ROWS, STATIC_GRADES, type BenchResult } from './benchmark';
  import { ADAPTERS } from './adapters';

  let { liveMeasurements }: { liveMeasurements: Record<string, Record<string, { value: string; result: BenchResult }>> } = $props();

  function cellFor(adapterId: string, rowKey: string) {
    const live = liveMeasurements[adapterId]?.[rowKey];
    if (live) return live;
    const staticGrade = STATIC_GRADES[adapterId]?.[rowKey];
    if (staticGrade) return { value: staticGrade.note ?? formatResult(staticGrade.result), result: staticGrade.result };
    return { value: '—', result: 'unknown' as BenchResult };
  }

  function formatResult(result: BenchResult) {
    return result === 'pass' ? '✓' : result === 'fail' ? '✗' : result === 'partial' ? '~' : '?';
  }

  function classFor(result: BenchResult) {
    return `r-${result}`;
  }
</script>

<section class="matrix" aria-label="Benchmark matrix">
  <div class="scroll" role="region" aria-label="Benchmark matrix table" tabindex="0">
    <table>
      <thead><tr><th class="sticky">Benchmark</th>{#each ADAPTERS as adapter (adapter.id)}<th>{adapter.label}</th>{/each}</tr></thead>
      <tbody>{#each BENCH_ROWS as row (row.key)}<tr><th class="sticky" title={row.description}><div>{row.label}</div>{#if row.measured}<span>measured</span>{/if}</th>{#each ADAPTERS as adapter (adapter.id)}{@const cell = cellFor(adapter.id, row.key)}<td class={classFor(cell.result)} title={row.description}>{cell.value}</td>{/each}</tr>{/each}</tbody>
    </table>
  </div>
  <div class="legend"><span class="r-pass">✓ pass</span><span class="r-partial">~ partial</span><span class="r-fail">✗ fail</span><span class="r-unknown">? unknown</span></div>
</section>

<style>
  .matrix { background: #fff; border: 1px solid #cfd4da; overflow: hidden; } .scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; color: #28323c; font-size: 12px; } th, td { border-bottom: 1px solid #d5dbe0; border-right: 1px solid #d5dbe0; padding: 8px 10px; text-align: left; white-space: nowrap; font-weight: 400; } th { background: #eef1f3; color: #28323c; font-weight: 600; } th.sticky { position: sticky; left: 0; background: #eef1f3; z-index: 2; min-width: 180px; } tbody tr:hover td, tbody tr:hover th { background: #f4f7f9; } th span { color: #59636d; font-family: ui-monospace, monospace; font-size: 10px; } .r-pass { color: #26734d; } .r-partial { color: #8a5a00; } .r-fail { color: #a63838; } .r-unknown { color: #59636d; } .legend { display: flex; gap: 12px; padding: 6px 12px; background: #f0f2f4; border-top: 1px solid #d5dbe0; font-family: ui-monospace, monospace; font-size: 11px; }
</style>
