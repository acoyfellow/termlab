<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { FakeShell, FIRES } from './fake-shell';
  import type { TerminalAdapter, TerminalHandle } from './terminal-adapter';
  import { record } from './live-measurements.svelte';
  import { holdPagePosition } from './hold-page-position';

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

  async function mountWithoutStealingPage(target: HTMLDivElement, fakeShell: FakeShell): Promise<TerminalHandle> {
    const release = holdPagePosition();
    try {
      return await adapter.mount(target, fakeShell);
    } finally {
      requestAnimationFrame(release);
    }
  }

  onMount(async () => {
    if (!host) return;
    shell = new FakeShell();
    const t0 = performance.now();
    try {
      handle = await mountWithoutStealingPage(host, shell);
      nameEmbeddedControls(host, adapter.label);
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

  function nameEmbeddedControls(element: HTMLDivElement, label: string) {
    element.querySelectorAll('iframe').forEach((frame) => frame.title = `${label} terminal`);
    element.querySelectorAll('input, textarea').forEach((control) => control.setAttribute('aria-label', `${label} terminal input`));
    element.querySelectorAll<HTMLElement>('[style*="overflow"], .xterm-viewport').forEach((region) => {
      if (region.scrollHeight > region.clientHeight) region.tabIndex = 0;
    });
  }

  function onFireClick(id: string) {
    shell?.fire(id);
    // Give the renderer a beat to settle, then force a fit for those
    // adapters that expose one.
    setTimeout(() => handle?.fit?.(), 50);

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
    background: #ffffff;
    border: 1px solid #cfd4da;
    border-radius: 0;
    overflow: hidden;
  }
  .head {
    padding: 10px 12px 8px;
    background: #f0f2f4;
    border-bottom: 1px solid #cfd4da;
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
    color: #202831;
  }
  .bundle-hint,
  .mount-hint {
    font-size: 11px;
    color: #4f5964;
    font-family: ui-monospace, monospace;
  }
  .description {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: #4f5964;
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
    background: #f0f2f4;
    border-top: 1px solid #cfd4da;
  }
  .actions button {
    background: #ffffff;
    color: #26313b;
    border: 1px solid #aeb7c0;
    border-radius: 0;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }
  .actions button:hover:not(:disabled) {
    background: #e4e8eb;
    border-color: #7e8994;
  }
  .actions button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
