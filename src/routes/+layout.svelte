<script lang="ts">
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(html, body) { margin: 0; min-height: 100%; background: #f8f9fa; color: #28323c; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  :global(*) { box-sizing: border-box; }
  :global(code, pre) { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>
