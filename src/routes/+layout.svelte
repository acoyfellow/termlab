<script lang="ts">
  let { children } = $props();
</script>

<svelte:head>
  <style>
    :global(html),
    :global(body) {
      margin: 0;
      padding: 0;
      background: #000;
      color: #f2efe8;
      font-family: 'Inter', system-ui, sans-serif;
      height: 100%;
    }
    :global(*) {
      box-sizing: border-box;
    }
  </style>
</svelte:head>

{@render children()}
