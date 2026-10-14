<script lang="ts">
  import { BROADCAST_FIRE_EVENT, FIRES, type BroadcastFireDetail } from './fake-shell';

  /**
   * Page-level "fire this in every terminal at once" controls.
   *
   * Dispatches a window-level CustomEvent that every live FakeShell
   * listens for. Keeps the page decoupled from individual terminal
   * refs — new adapters just work.
   *
   * Also includes a "Run all tests" macro that walks every canned
   * payload in sequence with a small gap between, so you can see how
   * each renderer handles sustained load without clicking through
   * by hand.
   */

  let running = $state(false);

  function broadcast(id: string) {
    const detail: BroadcastFireDetail = { id };
    window.dispatchEvent(new CustomEvent(BROADCAST_FIRE_EVENT, { detail }));
  }

  async function runAllTests() {
    if (running) return;
    running = true;
    try {
      // Clear first so every terminal starts from the same blank slate.
      broadcast('clear');
      await sleep(200);
      for (const fire of FIRES) {
        if (fire.id === 'clear') continue;
        broadcast(fire.id);
        // Let each payload settle before the next one so we can see
        // how the renderer handles one thing at a time AND what it
        // looks like stacked. 600ms is usually enough for the 10k
        // line burst to paint the first screenful.
        await sleep(600);
      }
    } finally {
      running = false;
    }
  }

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
</script>

<section class="global-controls" aria-label="Global terminal controls">
  <div class="group">
    <span class="group-label">Broadcast to all terminals:</span>
    {#each FIRES as f (f.id)}
      <button
        type="button"
        onclick={() => broadcast(f.id)}
        title={f.description}
        disabled={running}
      >
        {f.title}
      </button>
    {/each}
  </div>

  <div class="group">
    <button
      type="button"
      class="primary"
      onclick={runAllTests}
      disabled={running}
      title="Fires every canned payload in sequence, pausing between each. Useful for a rapid comparison pass."
    >
      {running ? 'Running…' : '▶ Run all tests'}
    </button>
  </div>
</section>

<style>
  .global-controls {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: center;
    padding: 10px 14px;
    background: #f0f2f4;
    border: 1px solid #cfd4da;
    border-radius: 0;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .group-label {
    font-size: 12px;
    color: #4f5964;
    font-family: ui-monospace, monospace;
    margin-right: 4px;
  }
  button {
    background: #ffffff;
    color: #26313b;
    border: 1px solid #aeb7c0;
    border-radius: 0;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.1s ease, border-color 0.1s ease;
  }
  button:hover:not(:disabled) {
    background: #e4e8eb;
    border-color: #7e8994;
  }
  button.primary {
    background: #315f82;
    border-color: #315f82;
    color: #ffffff;
    font-weight: 500;
  }
  button.primary:hover:not(:disabled) {
    background: #244b69;
    border-color: #244b69;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
