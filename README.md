# termlab

Side-by-side benchmark of web terminal emulators.

Live: **[termlab.coey.dev](https://termlab.coey.dev)**

Runs six implementations in one page, each backed by the same in-browser fake shell:

| Adapter | Renderer | Selection / Find | Notes |
|---|---|---|---|
| **xterm.js + DOM** (v6 default) | Real `<span>`s | ✅ Cmd+F, native select | Mature measurement code |
| **xterm.js + canvas** | `<canvas>` | ❌ | Historically fastest |
| **xterm.js + WebGL** | GPU `<canvas>` | ❌ | Fastest for heavy output |
| **cloudterm** | DOM spans | ✅ Cmd+F, native select | `acoyfellow/cloudterm`, v0.0.10 |
| **wterm** | Zig/WASM core + DOM | ✅ | `vercel-labs/wterm`, v0.5.x |
| **ghostty-web** | Ghostty VT (WASM) + canvas | ❌ | `coder/ghostty-web`, v0.4.x |
| **hterm** | iframe + canvas | ❌ | Chromium OS terminal, powers Chrome Remote Desktop |

## Why

I was wrestling with a web-terminal choice inside [cloudshell](https://github.com/acoyfellow/cloudshell) during Cloudflare Agents Week (April 2026). I kept getting burned by weird measurement / width bugs in one lib and not the others, and realized I couldn't evaluate them fairly without pulling them out of the product and setting them next to each other.

This is that bench. No WebSockets, no backend, no auth. Type in any terminal, or hit a button to fire a canned payload.

## What to test

- **Type stuff.** Enter runs tiny demo commands (`help`, `ls`, `ansi`, `boxes`, `long`, `emoji`, `clear`).
- **Cmd+F in your browser.** Which terminals let the browser find words in their output?
- **Drag to select.** Does selection work across wrapped lines? Across scrollback?
- **Scroll.** Mouse wheel, trackpad, keyboard. What's smooth, what's not?
- **ANSI rainbow button.** Do all styles render? Are colors consistent?
- **Box-drawing button.** Monospace alignment under Unicode box characters.
- **10k-line button.** Scrollback + find performance.
- **Emoji + CJK button.** Are wide characters the right width?
- **Mount time.** Noted in each header — how long each adapter took to initialize.

## Throughput benchmark

`bun run bench 5` runs three workloads (100k-line scroll flood, 1,500 full-screen redraws, 100k SGR runs) against every terminal in fresh headless Chromium processes, alternating order each round. It writes `src/lib/bench-results.json`, which the page renders. It needs Playwright's `chromium_headless_shell` in `~/Library/Caches/ms-playwright` (`bunx playwright install chromium-headless-shell`). WebGL runs on SwiftShader there, so the WebGL row understates a real GPU.

`bun bench/flame.ts --diff <cloudtermA> <cloudtermB> sgr-tokens` profiles both builds on the same workloads and ranks per-function self-time changes. It reliably detects changes of about 3 ms per run or more. Smaller changes are within run-to-run noise (garbage collection alone varies by about 0.6 ms) and are not reported reliably.

## Local dev

```sh
bun install
bun run dev
# → http://localhost:5180
```

## Stack

- SvelteKit 2 + Svelte 5 runes
- `@sveltejs/adapter-cloudflare` → Workers Static Assets
- `bun` package manager, `vite` build

## Deployment

Pushes to `main` run `wrangler deploy` via GitHub Actions. The site lives on Workers (not Pages) because Cloudflare's [official Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) now recommends Workers Static Assets for all new projects.

## License

MIT. Adapters import third-party libraries (xterm.js MIT, wterm MIT, hterm BSD-3-Clause); this repo's original code is MIT.
