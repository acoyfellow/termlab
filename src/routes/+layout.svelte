<script lang="ts">
  let { children } = $props();
</script>

{@render children()}

<style>
  /*
   * :global blocks apply body-wide styles without needing a <style>
   * inside <svelte:head>. Robust system font stack — Google Fonts
   * loads in the background and replaces when ready (font-display:
   * swap), but we never show Times as a fallback for users whose
   * Google Fonts request is slow/blocked.
   */
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: #000;
    color: #f2efe8;
    font-family:
      'Inter',
      -apple-system,
      BlinkMacSystemFont,
      'SF Pro Text',
      'Segoe UI',
      Roboto,
      'Helvetica Neue',
      Arial,
      sans-serif;
    height: 100%;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(code, pre) {
    font-family:
      'IBM Plex Mono',
      'SF Mono',
      Menlo,
      Consolas,
      'Liberation Mono',
      monospace;
  }
</style>
