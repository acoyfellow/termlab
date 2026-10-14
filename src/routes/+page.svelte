<script lang="ts">
  import TerminalCell from '$lib/TerminalCell.svelte';
  import BenchMatrix from '$lib/BenchMatrix.svelte';
  import BenchResults from '$lib/BenchResults.svelte';
  import GlobalControls from '$lib/GlobalControls.svelte';
  import { ADAPTERS } from '$lib/adapters';
  import { FakeShell } from '$lib/fake-shell';
  import { liveMeasurements } from '$lib/live-measurements.svelte';

  void FakeShell;
  const live = liveMeasurements();
</script>

<main>
  <header class="report-header">
    <p class="eyebrow">termlab / browser terminal measurement</p>
    <h1>Test report</h1>
    <p class="lede">Measured web-terminal output and agent interaction results.</p>
  </header>

  <BenchResults />

  <section class="live" aria-labelledby="live-title">
    <h2 id="live-title"><span>7</span> Live comparison</h2>
    <p>Each terminal below receives output from the same in-browser fake shell. No network or backend is used for the shell.</p>
    <GlobalControls />
    <BenchMatrix liveMeasurements={live} />
    <div class="grid">
      {#each ADAPTERS as adapter (adapter.id)}
        <TerminalCell {adapter} />
      {/each}
    </div>
  </section>
</main>

<style>
  main { width: min(100%, 1120px); margin: 0 auto; padding: 30px 20px 48px; }
  .report-header { border-bottom: 1px solid #cfd4da; padding-bottom: 20px; margin-bottom: 24px; }
  .eyebrow { margin: 0 0 8px; color: #5f6873; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
  h1 { margin: 0; color: #1c232b; font-size: clamp(28px, 6vw, 42px); font-weight: 600; letter-spacing: -.035em; }
  .lede { margin: 8px 0 0; color: #4f5964; font-size: 15px; }
  .live { margin-top: 34px; }
  h2 { margin: 0 0 8px; color: #202831; font-size: 19px; font-weight: 600; }
  h2 span { color: #697582; font-weight: 500; margin-right: 8px; }
  .live > p { margin: 0 0 14px; color: #56616c; font-size: 14px; line-height: 1.5; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 14px; margin-top: 16px; }
  @media (max-width: 520px) { main { padding: 20px 12px 36px; } }
</style>
