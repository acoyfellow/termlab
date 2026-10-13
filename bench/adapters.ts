import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Adapter = { id: string; version: string; sizeEntry: string; setup: string; extraAssets?: string[]; unverifiedTiming?: string };

export const root = join(import.meta.dir, "..");
export const pkg = (name: string) => JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version as string;

const cloudtermTag = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies.cloudterm.split("#")[1] ?? pkg("cloudterm");

export const adapters: Adapter[] = [
  {
    id: "cloudterm",
    version: cloudtermTag,
    sizeEntry: "import { mount } from 'cloudterm'; console.log(mount);",
    setup: `
      const { mount } = await import('cloudterm');
      const t = await mount(host, { onData: (d) => (window as any).__axInput?.(new TextDecoder().decode(d)), predictionMode: 'off' });
      return { write: (s) => t.write(s), text: () => [...host.querySelectorAll('.cloudterm-line')].map((l) => l.textContent).join('\\n'), destroy: () => t.destroy() };`,
  },
  {
    id: "cloudterm-perf",
    version: "main " + (JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies["cloudterm-perf"].split("#")[1] ?? "?"),
    sizeEntry: "import { mount } from 'cloudterm-perf'; console.log(mount);",
    setup: `
      const { mount } = await import('cloudterm-perf');
      const t = await mount(host, { onData: (d) => (window as any).__axInput?.(new TextDecoder().decode(d)), predictionMode: 'off' });
      return { write: (s) => t.write(s), text: () => [...host.querySelectorAll('.cloudterm-line')].map((l) => l.textContent).join('\\n'), destroy: () => t.destroy() };`,
  },
  {
    id: "xterm-dom",
    version: pkg("@xterm/xterm"),
    sizeEntry: "import { Terminal } from '@xterm/xterm'; console.log(Terminal);",
    setup: `
      const { Terminal } = await import('@xterm/xterm');
      const t = new Terminal({ cols: 120, rows: 40, scrollback: 10000 });
      t.open(host);
      t.onData((d) => (window as any).__axInput?.(d));
      return { write: (s) => new Promise((r) => t.write(s, r)), text: () => bufferText(t), destroy: () => t.dispose() };`,
  },
  {
    id: "xterm-webgl",
    version: `${pkg("@xterm/xterm")} + webgl ${pkg("@xterm/addon-webgl")}`,
    sizeEntry: "import { Terminal } from '@xterm/xterm'; import { WebglAddon } from '@xterm/addon-webgl'; console.log(Terminal, WebglAddon);",
    setup: `
      const [{ Terminal }, { WebglAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-webgl')]);
      const t = new Terminal({ cols: 120, rows: 40, scrollback: 10000 });
      t.open(host);
      let renderer = 'webgl';
      try { t.loadAddon(new WebglAddon()); } catch { renderer = 'dom-fallback'; }
      (window as any).__renderer = renderer;
      t.onData((d) => (window as any).__axInput?.(d));
      return { write: (s) => new Promise((r) => t.write(s, r)), text: () => bufferText(t), destroy: () => t.dispose() };`,
  },
  {
    id: "wterm",
    version: pkg("@wterm/dom"),
    sizeEntry: "import { WTerm } from '@wterm/dom'; console.log(WTerm);",
    setup: `
      const { WTerm } = await import('@wterm/dom');
      const t = new WTerm(host, { cols: 120, rows: 40, autoResize: false, onData: (d) => (window as any).__axInput?.(d) });
      await t.init();
      return { write: (s) => t.write(s), text: () => host.innerText, destroy: () => t.destroy() };`,
  },
  {
    id: "ghostty-web",
    version: pkg("ghostty-web"),
    sizeEntry: "import * as g from 'ghostty-web'; console.log(g);",
    setup: `
      const g = await import('ghostty-web');
      await g.init();
      const t = new g.Terminal({ cols: 120, rows: 40, scrollback: 10000 });
      t.open(host);
      t.onData((d) => (window as any).__axInput?.(d));
      return { write: (s) => new Promise((r) => t.write(s, r)), text: () => bufferText(t), destroy: () => t.dispose() };`,
  },
  {
    id: "xterm-dom-beta",
    version: pkg("@xterm/xterm-beta"),
    sizeEntry: "import { Terminal } from '@xterm/xterm-beta'; console.log(Terminal);",
    setup: `
      const { Terminal } = await import('@xterm/xterm-beta');
      const t = new Terminal({ cols: 120, rows: 40, scrollback: 10000 });
      t.open(host);
      t.onData((d) => (window as any).__axInput?.(d));
      return { write: (s) => new Promise((r) => t.write(s, r)), text: () => bufferText(t), destroy: () => t.dispose() };`,
  },
  {
    id: "restty",
    version: pkg("restty"),
    unverifiedTiming: "restty exposes no screen text, so completion is detected through its search API. All three workloads report the same ~67 ms, which suggests search resolves before output is painted. Timings are not comparable until a pixel-based check exists.",
    sizeEntry: "import { Terminal } from 'restty/xterm'; console.log(Terminal);",
    setup: `
      const { Terminal } = await import('restty/xterm');
      const t = new Terminal({ cols: 120, rows: 40 });
      t.open(host);
      const readyBy = performance.now() + 20000;
      while (performance.now() < readyBy && (t.restty?.getBackend?.() ?? 'none') === 'none') await new Promise((r) => setTimeout(r, 50));
      (window as any).__renderer = () => t.restty?.getBackend?.() ?? null;
      t.onData((d) => (window as any).__axInput?.(d));
      const marker = { seen: '' };
      return { write: (s) => new Promise((r) => { const m = s.match(/END-[A-Z]+/); if (m) marker.seen = m[0]; t.write(s, r); }), text: () => { const r = t.restty; if (!r || !marker.seen) return ''; if (r.getSearchState().query !== marker.seen) r.setSearchQuery(marker.seen); const st = r.getSearchState(); return st.complete && st.total > 0 ? marker.seen : ''; }, destroy: () => t.dispose() };`,
  },
  {
    id: "ferroterm",
    version: pkg("ferroterm"),
    extraAssets: ["ferroterm/pkg/ferroterm_wasm_bg.wasm"],
    sizeEntry: "import { Ferroterm } from 'ferroterm'; console.log(Ferroterm);",
    setup: `
      const [{ Ferroterm }, { default: wasmUrl }] = await Promise.all([import('ferroterm'), import('ferroterm/pkg/ferroterm_wasm_bg.wasm')]);
      const t = await Ferroterm.create(host, { cols: 120, rows: 40, scrollback: 10000, autoFit: false, wasmUrl });
      (window as any).__renderer = () => t.rendererName;
      t.onData((d) => (window as any).__axInput?.(new TextDecoder().decode(d)));
      return { write: (s) => t.write(s), text: () => { const n = t.totalLines(); let out = ''; for (let i = Math.max(0, n - 45); i < n; i++) out += t.lineText(i) + '\\n'; return out; }, destroy: () => t.dispose() };`,
  },
  {
    id: "auterm",
    version: pkg("auterm"),
    sizeEntry: "import { Terminal } from 'auterm'; console.log(Terminal);",
    setup: `
      const { Terminal } = await import('auterm');
      const t = new Terminal(host, { scrollback: 10000 });
      t.resize(120, 40);
      t.onData((d) => (window as any).__axInput?.(d));
      return { write: (s) => t.write(s), text: () => { const n = t.totalRows; let out = ''; for (let i = Math.max(0, n - 45); i < n; i++) out += t.getLine(i).map((c) => c.char).join('') + '\\n'; return out; }, destroy: () => t.dispose() };`,
  },
  {
    id: "hterm-upstream",
    version: pkg("hterm-upstream") + " (libapps HEAD)",
    sizeEntry: "import { hterm } from 'hterm-upstream'; console.log(hterm);",
    setup: `
      const { hterm } = await import('hterm-upstream');
      await hterm.initPromise;
      const t = new hterm.Terminal();
      await new Promise((r) => { t.onTerminalReady = r; t.decorate(host); });
      const io = t.io.push();
      io.onVTKeystroke = io.sendString = (d) => (window as any).__axInput?.(d);
      return { write: (s) => io.print(s), text: () => { const out = []; const n = t.getRowCount(); for (let i = Math.max(0, n - 45); i < n; i++) out.push(t.getRowText(i)); return out.join('\\n'); }, destroy: () => {} };`,
  },
  {
    id: "hterm",
    version: pkg("hterm-umdjs"),
    sizeEntry: "import * as h from 'hterm-umdjs'; console.log(h);",
    setup: `
      const { hterm, lib } = await import('hterm-umdjs');
      hterm.defaultStorage = new lib.Storage.Memory();
      const t = new hterm.Terminal();
      await new Promise((r) => { t.onTerminalReady = r; t.decorate(host); });
      const io = t.io.push();
      io.onVTKeystroke = io.sendString = (d) => (window as any).__axInput?.(d);
      return { write: (s) => io.print(s), text: () => { const out = []; const n = t.getRowCount(); for (let i = Math.max(0, n - 45); i < n; i++) out.push(t.getRowText(i)); return out.join('\\n'); }, destroy: () => {} };`,
  },
];


export const freePort = () => { const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); const p = s.port; s.stop(true); return p; };
