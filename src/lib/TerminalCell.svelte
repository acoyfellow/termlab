<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { FakeShell, FIRES } from './fake-shell';
  import type { TerminalAdapter, TerminalHandle } from './terminal-adapter';
  import { record } from './live-measurements.svelte';

  let {
    adapter,
  }: {
    adapter: TerminalAdapter;
  } = $props();

  let host: HTMLDivElement | null = $state(null);
  let handle: TerminalHandle | null = null;
  let shell: FakeShell | null = null;
  let status: 'loading' | 'ready' | 'error' = $state('loading');
  let errorMessage = $state('');
  let mountMs = $state<number | null>(null);

  onMount(async () => {
    if (!host) return;
    shell = new FakeShell();
    const t0 = performance.now();
    try {
      handle = await adapter.mount(host, shell);
      mountMs = Math.round(performance.now() - t0);
      status = 'ready';
      // Publish to the bench matrix. Green below 100ms, yellow under
      // 500ms, red above.
      const result = mountMs < 100 ? 'pass' : mountMs < 500 ? 'partial' : 'fail';
      record(adapter.id, 'mount-ms', {
        value: `${mountMs}ms`,
        result,
      });
      if (adapter.bundleHint) {
        record(adapter.id, 'bundle-size', {
          value: adapter.bundleHint,
          result: 'partial',
        });
      }
    } catch (err) {
      console.error(`[${adapter.id}] mount failed:`, err);
      status = 'error';
      errorMessage = (err as Error).message || String(err);
    }
  });

  onDestroy(() => {
    try {
      handle?.destroy();
    } catch (err) {
      console.warn(`[${adapter.id}] destroy:`, err);
    }
    // Unhook the shell's broadcast listener so we don't leak between
    // hot-reloads in dev and nav events in prod.
    shell?.dispose();
  });

  function onFireClick(id: string) {
    shell?.fire(id);
    // Give the renderer a beat to settle, then force a fit for those
    // adapters that expose one.
    setTimeout(() => handle?.fit?.(), 50);

    // Measure write throughput when the user fires the 10k-line button.
    // Rough — real perf measurement needs many more samples. Good
    // enough for a side-by-side "is one obviously slower?" check.
    if (id === 'long-log') {
      const t = performance.now();
      queueMicrotask(() => {
        const elapsed = performance.now() - t;
        const result = elapsed < 100 ? 'pass' : elapsed < 400 ? 'partial' : 'fail';
        record(adapter.id, 'throughput', {
          value: `10k lines in ${Math.round(elapsed)}ms`,
          result,
        });
      });
    }
  }
</script>

<section class="cell">
  <header class="head">
    <div class="title-row">
      <h2 class="title">{adapter.label}</h2>
      {#if adapter.bundleHint}
        <span class="bundle-hint">{adapter.bundleHint}</span>
      {/if}
      {#if mountMs != null}
        <span class="mount-hint">mount {mountMs}ms</span>
      {/if}
    </div>
    <p class="description">{adapter.description}</p>
  </header>

  <div class="host-wrap">
    <div bind:this={host} class="host" data-adapter={adapter.id}></div>
    {#if status === 'loading'}
      <div class="overlay">loading…</div>
    {:else if status === 'error'}
      <div class="overlay error">
        <strong>mount failed</strong>
        <pre>{errorMessage}</pre>
      </div>
    {/if}
  </div>

  <footer class="actions">
    {#each FIRES as f (f.id)}
      <button
        type="button"
        onclick={() => onFireClick(f.id)}
        title={f.description}
        disabled={status !== 'ready'}
      >
        {f.title}
      </button>
    {/each}
  </footer>
</section>

<style>
  .cell {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    background: #0a0a0a;
    border: 1px solid #222;
    border-radius: 8px;
    overflow: hidden;
  }
  .head {
    padding: 10px 12px 8px;
    background: #111;
    border-bottom: 1px solid #222;
  }
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #f2efe8;
  }
  .bundle-hint,
  .mount-hint {
    font-size: 11px;
    color: #8a8a8a;
    font-family: 'IBM Plex Mono', monospace;
  }
  .description {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: #a1a1aa;
  }
  .host-wrap {
    position: relative;
    flex: 1;
    min-height: 340px;
    background: #000;
  }
  .host {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.85);
    color: #d4d4d4;
    font-size: 13px;
    font-family: 'IBM Plex Mono', monospace;
    pointer-events: none;
  }
  .overlay.error {
    color: #fca5a5;
  }
  .overlay pre {
    max-width: 80%;
    white-space: pre-wrap;
    font-size: 11px;
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding: 8px 10px;
    background: #111;
    border-top: 1px solid #222;
  }
  .actions button {
    background: #1f1f1f;
    color: #d4d4d4;
    border: 1px solid #2a2a2a;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }
  .actions button:hover:not(:disabled) {
    background: #2a2a2a;
    border-color: #3a3a3a;
  }
  .actions button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
