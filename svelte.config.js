import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Deployed as a Workers Static Assets app. SvelteKit's adapter-cloudflare
 * emits a small `_worker.js` + a static bundle; wrangler uploads both.
 * No SSR needed for this site but the adapter handles routing either
 * way, so we leave it default.
 */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      routes: {
        include: ['/*'],
        exclude: ['<all>'],
      },
    }),
  },
};
