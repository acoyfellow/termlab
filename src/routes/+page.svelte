<script lang="ts">
  import TerminalCell from '$lib/TerminalCell.svelte';
  import BenchMatrix from '$lib/BenchMatrix.svelte';
  import { ADAPTERS } from '$lib/adapters';
  import { FakeShell } from '$lib/fake-shell';
  import { liveMeasurements } from '$lib/live-measurements.svelte';

  // Sanity touch so tree-shaker doesn't drop FakeShell from the module graph.
  void FakeShell;

  const live = liveMeasurements();
</script>

<main>
  <header class="page-head">
    <div>
      <h1>termlab</h1>
      <p class="sub">
        Side-by-side benchmark of web terminal emulators. Type in any terminal
        below, or click a "fire" button to push a canned payload. A fake shell
        runs in-browser — no network, no backend.
      </p>
      <p class="sub">
        Things to test: <strong>Cmd+F</strong> to search output, <strong>drag-select</strong>
        to copy, <strong>scroll</strong> back through history, compare <strong>ANSI
        colors</strong> / <strong>box drawing</strong> / <strong>emoji</strong>
        alignment, watch <strong>mount time</strong> on page load.
      </p>
      <p class="sub">
        Public repo: <a href="https://github.com/acoyfellow/termlab">github.com/acoyfellow/termlab</a>
        &nbsp;·&nbsp; Built by <a href="https://coey.dev">@acoyfellow</a> during the AX
        cloudshell spike (Apr 2026).
      </p>
    </div>
  </header>

  <BenchMatrix liveMeasurements={live} />

  <div class="grid">
    {#each ADAPTERS as adapter (adapter.id)}
      <TerminalCell {adapter} />
    {/each}
  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
    min-height: 100vh;
  }
  .page-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: #f2efe8;
    letter-spacing: -0.02em;
  }
  .sub {
    margin: 4px 0 0;
    color: #a1a1aa;
    font-size: 13px;
    line-height: 1.5;
    max-width: 820px;
  }
  .sub a {
    color: #d4d4d4;
    text-decoration: underline;
    text-decoration-color: #444;
  }
  .sub a:hover {
    text-decoration-color: #888;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(520px, 1fr));
    gap: 16px;
    flex: 1;
  }
</style>
