import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ProbeKind = "dom" | "buffer" | "snapshot" | "search";

export type Adapter = {
  id: string;
  version: string;
  probe: ProbeKind;
  sizeEntry: string;
  setup: string;
  extraAssets?: string[];
  unverifiedTiming?: string;
};

export const root = join(import.meta.dir, "..");
export const pkg = (name: string) => JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version as string;

const cloudtermTag = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies.cloudterm.split("#")[1] ?? pkg("cloudterm");

const wtermScreenHelper = `
function wtermScreen(t) {
  const b = t.bridge;
  if (!b) return [];
  const out = [];
  for (let r = 0; r < t.rows; r++) {
    let line = '';
    for (let c = 0; c < t.cols; c++) {
      const cell = b.getCell(r, c);
      if (!cell || cell.width === 0) continue;
      line += cell.chars || (cell.char ? String.fromCodePoint(cell.char) : ' ');
    }
    out.push(line.trimEnd());
  }
  return out;
}`;

export const adapters: Adapter[] = [
  {
    id: "cloudterm",
    version: cloudtermTag,
    probe: "dom",
    sizeEntry: "import { mount } from 'cloudterm'; console.log(mount);",
    setup: `
      const { mount } = await import('cloudterm');
      const t = await mount(host, { maxScrollback: 10000, onData: (d) => (window as any).__axInput?.(new TextDecoder().decode(d)), predictionMode: 'off' });
      const fitGrid = (cols, rows) => {
        for (let pass = 0; pass < 4 && (t.cols !== cols || t.rows !== rows); pass++) {
          const cw = host.clientWidth / Math.max(1, t.cols);
          const ch = host.clientHeight / Math.max(1, t.rows);
          host.style.width = Math.ceil(cols * cw + 1) + 'px';
          host.style.height = Math.ceil(rows * ch + 1) + 'px';
          t.fit();
        }
      };
      fitGrid(120, 40);
      const nbsp = new RegExp('\\u00a0', 'g');
      return {
        write: (s) => t.write(s),
        text: () => [...host.querySelectorAll('.cloudterm-line')].map((l) => l.textContent).join('\\n'),
        screen: () => [...host.querySelectorAll('.cloudterm-line')].slice(-t.rows).map((l) => (l.textContent ?? '').replace(nbsp, ' ').trimEnd()),
        size: () => ({ cols: t.cols, rows: t.rows }),
        resize: (c, r) => fitGrid(c, r),
        destroy: () => t.destroy(),
      };`,
  },
  {
    id: "xterm-dom",
    version: pkg("@xterm/xterm"),
    probe: "buffer",
    sizeEntry: "import { Terminal } from '@xterm/xterm'; console.log(Terminal);",
    setup: `
      const { Terminal } = await import('@xterm/xterm');
      const t = new Terminal({ cols: 120, rows: 40, scrollback: 10000 });
      t.open(host);
      t.onData((d) => (window as any).__axInput?.(d));
      return {
        write: (s) => new Promise((r) => t.write(s, r)),
        text: () => bufferText(t),
        screen: () => bufferScreen(t),
        size: () => ({ cols: t.cols, rows: t.rows }),
        resize: (c, r) => t.resize(c, r),
        destroy: () => t.dispose(),
      };`,
  },
  {
    id: "xterm-webgl",
    version: `${pkg("@xterm/xterm")} + webgl ${pkg("@xterm/addon-webgl")}`,
    probe: "buffer",
    sizeEntry: "import { Terminal } from '@xterm/xterm'; import { WebglAddon } from '@xterm/addon-webgl'; console.log(Terminal, WebglAddon);",
    setup: `
      const [{ Terminal }, { WebglAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-webgl')]);
      const t = new Terminal({ cols: 120, rows: 40, scrollback: 10000 });
      t.open(host);
      let renderer = 'webgl';
      try { t.loadAddon(new WebglAddon()); } catch { renderer = 'dom-fallback'; }
      (window as any).__renderer = renderer;
      t.onData((d) => (window as any).__axInput?.(d));
      return {
        write: (s) => new Promise((r) => t.write(s, r)),
        text: () => bufferText(t),
        screen: () => bufferScreen(t),
        size: () => ({ cols: t.cols, rows: t.rows }),
        resize: (c, r) => t.resize(c, r),
        destroy: () => t.dispose(),
      };`,
  },
  {
    id: "wterm",
    version: pkg("@wterm/dom"),
    probe: "dom",
    sizeEntry: "import { WTerm } from '@wterm/dom'; console.log(WTerm);",
    setup: `
      const { WTerm } = await import('@wterm/dom');
      await import('@wterm/dom/css');
      ${wtermScreenHelper}
      const t = new WTerm(host, { cols: 120, rows: 40, scrollbackLines: 10000, autoResize: false, renderer: 'dom', onData: (d) => (window as any).__axInput?.(d) });
      await t.init();
      return {
        write: (s) => t.write(s),
        text: () => host.innerText,
        screen: () => wtermScreen(t),
        size: () => ({ cols: t.cols, rows: t.rows }),
        resize: (c, r) => t.resize(c, r),
        destroy: () => t.destroy(),
      };`,
  },
  {
    id: "wterm-webgl",
    version: `${pkg("@wterm/dom")} (webgl)`,
    probe: "buffer",
    sizeEntry: "import { WTerm } from '@wterm/dom'; console.log(WTerm);",
    setup: `
      const { WTerm } = await import('@wterm/dom');
      await import('@wterm/dom/css');
      ${wtermScreenHelper}
      const t = new WTerm(host, { cols: 120, rows: 40, scrollbackLines: 10000, autoResize: false, renderer: 'webgl', onData: (d) => (window as any).__axInput?.(d) });
      await t.init();
      (window as any).__renderer = () => ((t as any).renderer?.gpuShown ? 'webgl' : 'dom-fallback');
      return {
        write: (s) => t.write(s),
        text: () => wtermScreen(t).join('\\n'),
        screen: () => wtermScreen(t),
        size: () => ({ cols: t.cols, rows: t.rows }),
        resize: (c, r) => t.resize(c, r),
        destroy: () => t.destroy(),
      };`,
  },
  {
    id: "ghostty-web",
    version: pkg("ghostty-web"),
    probe: "buffer",
    sizeEntry: "import * as g from 'ghostty-web'; console.log(g);",
    setup: `
      const g = await import('ghostty-web');
      await g.init();
      const t = new g.Terminal({ cols: 120, rows: 40, scrollback: 10000 });
      t.open(host);
      t.reset();
      t.onData((d) => (window as any).__axInput?.(d));
      const ghosttyScreen = () => {
        const b = t.buffer?.active;
        if (!b) return [];
        const out = [];
        for (let r = 0; r < t.rows; r++) {
          const line = b.getLine(b.baseY + r);
          let s = '';
          for (let c = 0; c < t.cols; c++) {
            const cell = line?.getCell(c);
            if (!cell || cell.getWidth() === 0) continue;
            s += cell.getChars() || ' ';
          }
          out.push(s.trimEnd());
        }
        return out;
      };
      return {
        write: (s) => new Promise((r) => t.write(s, r)),
        text: () => bufferText(t),
        screen: ghosttyScreen,
        size: () => ({ cols: t.cols, rows: t.rows }),
        resize: (c, r) => t.resize(c, r),
        destroy: () => t.dispose(),
      };`,
  },
  {
    id: "xterm-dom-beta",
    version: pkg("@xterm/xterm-beta"),
    probe: "buffer",
    sizeEntry: "import { Terminal } from '@xterm/xterm-beta'; console.log(Terminal);",
    setup: `
      const { Terminal } = await import('@xterm/xterm-beta');
      const t = new Terminal({ cols: 120, rows: 40, scrollback: 10000 });
      t.open(host);
      t.onData((d) => (window as any).__axInput?.(d));
      return {
        write: (s) => new Promise((r) => t.write(s, r)),
        text: () => bufferText(t),
        screen: () => bufferScreen(t),
        size: () => ({ cols: t.cols, rows: t.rows }),
        resize: (c, r) => t.resize(c, r),
        destroy: () => t.dispose(),
      };`,
  },
  {
    id: "restty",
    version: pkg("restty"),
    probe: "search",
    unverifiedTiming: "restty exposes no screen text, so completion is detected through its search API. Search can resolve before output is painted; timings are not comparable until a pixel-based check exists.",
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
      const markerRe = new RegExp('END-[A-Z]+');
      return {
        write: (s) => new Promise((r) => { const m = s.match(markerRe); if (m) marker.seen = m[0]; t.write(s, r); }),
        text: () => { const r = t.restty; if (!r || !marker.seen) return ''; if (r.getSearchState().query !== marker.seen) r.setSearchQuery(marker.seen); const st = r.getSearchState(); return st.complete && st.total > 0 ? marker.seen : ''; },
        screen: () => null,
        size: () => ({ cols: t.cols, rows: t.rows }),
        resize: (c, r) => t.resize(c, r),
        destroy: () => t.dispose(),
      };`,
  },
  {
    id: "ferroterm",
    version: pkg("ferroterm"),
    probe: "buffer",
    extraAssets: ["ferroterm/pkg/ferroterm_wasm_bg.wasm"],
    sizeEntry: "import { Ferroterm } from 'ferroterm'; console.log(Ferroterm);",
    setup: `
      const [{ Ferroterm }, { default: wasmUrl }] = await Promise.all([import('ferroterm'), import('ferroterm/pkg/ferroterm_wasm_bg.wasm')]);
      await import('ferroterm/style.css');
      const t = await Ferroterm.create(host, { cols: 120, rows: 40, scrollback: 10000, autoFit: false, wasmUrl });
      (window as any).__renderer = () => t.rendererName;
      t.onData((d) => (window as any).__axInput?.(new TextDecoder().decode(d)));
      let curCols = 120;
      let curRows = 40;
      return {
        write: (s) => t.write(s),
        text: () => { const n = t.totalLines(); let out = ''; for (let i = Math.max(0, n - 45); i < n; i++) out += t.lineText(i) + '\\n'; return out; },
        screen: () => { const n = t.totalLines(); const start = Math.max(0, n - curRows); const out = []; for (let i = start; i < n; i++) out.push(t.lineText(i).trimEnd()); return out; },
        size: () => ({ cols: curCols, rows: curRows }),
        resize: (c, r) => { curCols = c; curRows = r; t.resize(c, r); },
        destroy: () => t.dispose(),
      };`,
  },
  {
    id: "t3code-ghostty",
    version: "t3code " + pkg("t3code-ghostty").split("-")[1] + " (libghostty-vt wasm)",
    probe: "snapshot",
    extraAssets: ["t3code-ghostty/ghostty-vt.wasm"],
    sizeEntry: "import { GhosttyTerminalSurface } from 't3code-ghostty'; console.log(GhosttyTerminalSurface);",
    setup: `
      const [{ default: vt }, { default: pty }, { default: font }] = await Promise.all([import('t3code-ghostty/ghostty-vt.wasm'), import('t3code-ghostty/ghostty-write-pty.wasm'), import('t3code-ghostty/SymbolsNerdFontMono-Regular.woff2')]);
      (globalThis as any).__T3_GHOSTTY_ASSETS = { 'ghostty-vt.wasm': vt, 'ghostty-write-pty.wasm': pty, 'SymbolsNerdFontMono-Regular.woff2': font };
      const { GhosttyTerminalSurface } = await import('t3code-ghostty');
      const color = (r, g, b) => ({ r, g, b });
      host.style.width = '1440px';
      host.style.height = '960px';
      const t = await GhosttyTerminalSurface.create(host, { theme: { foreground: color(229, 231, 235), background: color(0, 0, 0), cursor: color(229, 231, 235) }, onData: (d) => (window as any).__axInput?.(d), onResize: () => {}, onSelectionChange: () => {}, beforeKey: () => true, onLinkActivate: () => {} });
      t.setSharedGrid({ cols: 120, rows: 40 });
      t.fit();
      return {
        write: (s) => t.write(s),
        text: () => ((t as any).snapshot?.rowData ?? []).map((row) => row.text).join('\\n'),
        screen: () => ((t as any).snapshot?.rowData ?? []).map((row) => row.cells.filter((c) => c.wide !== 2 && c.wide !== 3).map((c) => c.text || ' ').join('').trimEnd()),
        size: () => ({ cols: t.cols, rows: t.rows }),
        resize: (c, r) => { t.setSharedGrid({ cols: c, rows: r }); t.fit(); },
        destroy: () => t.dispose(),
      };`,
  },
  {
    id: "auterm",
    version: pkg("auterm"),
    probe: "buffer",
    sizeEntry: "import { Terminal } from 'auterm'; console.log(Terminal);",
    setup: `
      const { Terminal } = await import('auterm');
      const t = new Terminal(host, { scrollback: 10000 });
      if ((t as any).renderer) (t as any).renderer.onResize = null;
      t.resize(120, 40);
      t.onData((d) => (window as any).__axInput?.(d));
      return {
        write: (s) => t.write(s),
        text: () => { const n = t.totalRows; let out = ''; for (let i = Math.max(0, n - 45); i < n; i++) out += t.getLine(i).map((c) => c.char).join('') + '\\n'; return out; },
        screen: () => { const st = (t as any).state; const sb = st?.scrollbackRows ?? 0; const nr = st?.rows ?? 40; const out = []; for (let i = 0; i < nr; i++) out.push(t.getLine(sb + i).map((c) => c.width === 0 ? '' : (c.char || ' ')).join('').trimEnd()); return out; },
        size: () => ({ cols: (t as any).state?.cols ?? 120, rows: (t as any).state?.rows ?? 40 }),
        resize: (c, r) => t.resize(c, r),
        destroy: () => t.dispose(),
      };`,
  },
  {
    id: "hterm-upstream",
    version: pkg("hterm-upstream") + " (libapps HEAD)",
    probe: "buffer",
    sizeEntry: "import { hterm } from 'hterm-upstream'; console.log(hterm);",
    setup: `
      const { hterm } = await import('hterm-upstream');
      await hterm.initPromise;
      const t = new hterm.Terminal();
      await new Promise((r) => { t.onTerminalReady = r; t.decorate(host); });
      await nextFrame();
      t.scrollPort_.onResize = () => {};
      t.setWidth(120);
      t.setHeight(40);
      const io = t.io.push();
      io.onVTKeystroke = io.sendString = (d) => (window as any).__axInput?.(d);
      const readRows = () => (t.screen_?.rowsArray ?? []).map((r) => (r.textContent ?? '').trimEnd());
      return {
        write: (s) => io.print(s),
        text: () => readRows().join('\\n'),
        screen: () => readRows(),
        size: () => ({ cols: t.screenSize.width, rows: t.screenSize.height }),
        resize: (c, r) => { t.setWidth(c); t.setHeight(r); },
        destroy: () => {},
      };`,
  },
  {
    id: "hterm",
    version: pkg("hterm-umdjs"),
    probe: "buffer",
    sizeEntry: "import * as h from 'hterm-umdjs'; console.log(h);",
    setup: `
      const { hterm, lib } = await import('hterm-umdjs');
      hterm.defaultStorage = new lib.Storage.Memory();
      const t = new hterm.Terminal();
      await new Promise((r) => { t.onTerminalReady = r; t.decorate(host); });
      await nextFrame();
      t.scrollPort_.onResize = () => {};
      t.scrollPort_.onResize_ = () => {};
      t.setWidth(120);
      t.setHeight(40);
      const io = t.io.push();
      io.onVTKeystroke = io.sendString = (d) => (window as any).__axInput?.(d);
      const readRows = () => (t.screen_?.rowsArray ?? []).map((r) => (r.textContent ?? '').trimEnd());
      return {
        write: (s) => io.print(s),
        text: () => readRows().join('\\n'),
        screen: () => readRows(),
        size: () => ({ cols: t.screenSize.width, rows: t.screenSize.height }),
        resize: (c, r) => { t.setWidth(c); t.setHeight(r); },
        destroy: () => {},
      };`,
  },
];

export const freePort = () => { const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); const p = s.port; s.stop(true); return p; };
