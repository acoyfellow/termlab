import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: { port: 5180 },
  // @wterm/core bundles its WASM; hterm's UMD package expects some
  // Node-ish globals that we don't need for the subset we use.
  optimizeDeps: {
    include: ['@xterm/xterm', '@xterm/addon-fit'],
  },
});
