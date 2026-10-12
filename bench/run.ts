import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Adapter = { id: string; version: string; sizeEntry: string; setup: string };

const root = join(import.meta.dir, "..");
const out = join(import.meta.dir, ".out");
mkdirSync(out, { recursive: true });
const pkg = (name: string) => JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version as string;

const adapters: Adapter[] = [
  {
    id: "cloudterm",
    version: pkg("cloudterm") === "0.0.1" ? "v0.0.10" : pkg("cloudterm"),
    sizeEntry: "import { mount } from 'cloudterm'; console.log(mount);",
    setup: `
      const { mount } = await import('cloudterm');
      const t = await mount(host, { onData() {}, predictionMode: 'off' });
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
      return { write: (s) => new Promise((r) => t.write(s, r)), text: () => bufferText(t), destroy: () => t.dispose() };`,
  },
  {
    id: "wterm",
    version: pkg("@wterm/dom"),
    sizeEntry: "import { WTerm } from '@wterm/dom'; console.log(WTerm);",
    setup: `
      const { WTerm } = await import('@wterm/dom');
      const t = new WTerm(host, { cols: 120, rows: 40, autoResize: false, onData() {} });
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
      return { write: (s) => new Promise((r) => t.write(s, r)), text: () => bufferText(t), destroy: () => t.dispose() };`,
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
      return { write: (s) => io.print(s), text: () => { const out = []; const n = t.getRowCount(); for (let i = Math.max(0, n - 45); i < n; i++) out.push(t.getRowText(i)); return out.join('\\n'); }, destroy: () => {} };`,
  },
];

const cols = 120;
const rows = 40;
const workloads: Record<string, { input: string; marker: string }> = {
  "scroll-flood": { input: Array.from({ length: 100000 }, (_, i) => `line ${i} ` + "x".repeat(80)).join("\r\n") + "\r\nEND-SCROLL", marker: "END-SCROLL" },
  "full-redraw": { input: Array.from({ length: 1500 }, (_, f) => "\x1b[H" + Array.from({ length: rows - 1 }, (_, r) => `\x1b[3${(f + r) % 8}m` + `${f}:${r} `.padEnd(cols - 1, "#") + "\x1b[0m").join("\r\n")).join("") + "\r\nEND-REDRAW", marker: "END-REDRAW" },
  "sgr-tokens": { input: "\x1b[32mfoo\x1b[0m ".repeat(100000) + "\r\nEND-SGR", marker: "END-SGR" },
};

const html = (adapter: Adapter) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}#host{width:${cols * 9}px;height:${rows * 18}px}</style></head>
<body><div id="host"></div><script type="module" src="./page-${adapter.id}.ts"></script></body></html>`;

const script = (adapter: Adapter) => `import '@xterm/xterm/css/xterm.css';
const host = document.getElementById('host');
const workloads = ${JSON.stringify(workloads)};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
function bufferText(t) { const b = t.buffer?.active; if (!b) return ''; let s = ''; for (let i = Math.max(0, b.length - 45); i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\\n'; return s; }
async function make(): Promise<any> { ${adapter.setup} }
async function settle(t, marker, deadline) {
  while (performance.now() < deadline) { await nextFrame(); if (String(t.text()).includes(marker)) return true; }
  return false;
}
(window as any).run = async (name) => {
  const w = workloads[name];
  host.innerHTML = '';
  const m0 = performance.now();
  const t = await make();
  await nextFrame();
  const mountMs = performance.now() - m0;
  const t0 = performance.now();
  const pending = []; for (let i = 0; i < w.input.length; i += 16384) pending.push(t.write(w.input.slice(i, i + 16384))); await Promise.all(pending);
  const ok = await settle(t, w.marker, t0 + 30000);
  await nextFrame();
  await nextFrame();
  const ms = performance.now() - t0;
  const mem = (performance as any).memory;
  const heap = mem ? mem.usedJSHeapSize / 1048576 : null;
  const textInDom = String(host.innerText).includes(w.marker);
  const canvas = host.querySelector('canvas') !== null;
  try { t.destroy(); } catch {}
  return { ok, ms, mountMs, heap, textInDom, canvas, renderer: (window as any).__renderer ?? null };
};
(window as any).ready = true;
`;

const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop()!;
const binary = join(cacheDir, shellDir, readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-headless-shell"))!, "chrome-headless-shell");

for (const adapter of adapters) { writeFileSync(join(out, `page-${adapter.id}.html`), html(adapter)); writeFileSync(join(out, `page-${adapter.id}.ts`), script(adapter)); }
const routes: Record<string, unknown> = {};
for (const a of adapters) routes[`/${a.id}`] = (await import(join(out, `page-${a.id}.html`))).default;
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", development: false, routes: routes as any });

async function sample(adapter: Adapter, workload: string, port: number) {
  const chrome = spawn(binary, [`--remote-debugging-port=${port}`, "--enable-precise-memory-info", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
  try {
    let ws = "";
    for (let i = 0; i < 80 && !ws; i++) {
      try { ws = ((await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as any[]).find((t) => t.type === "page")?.webSocketDebuggerUrl ?? ""; } catch {}
      if (!ws) await Bun.sleep(100);
    }
    const sock = new WebSocket(ws);
    await new Promise((r) => sock.addEventListener("open", r, { once: true }));
    let id = 0;
    const waiting = new Map<number, (v: any) => void>();
    const errors: string[] = [];
    sock.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id) waiting.get(m.id)?.(m);
      if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    });
    const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++id; waiting.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/${adapter.id}` });
    for (let i = 0; i < 100; i++) {
      const r = await send("Runtime.evaluate", { expression: "window.ready === true", returnByValue: true });
      if (r.result?.result?.value) break;
      await Bun.sleep(100);
    }
    const r = await send("Runtime.evaluate", { expression: `run(${JSON.stringify(workload)})`, awaitPromise: true, returnByValue: true, timeout: 60000 });
    sock.close();
    return { ...(r.result?.result?.value ?? { ok: false, ms: NaN, error: JSON.stringify(r.result?.exceptionDetails ?? r).slice(0, 300) }), errors };
  } finally {
    chrome.kill("SIGKILL");
  }
}

const rounds = Number(process.argv[2] ?? 5);
const results: Record<string, Record<string, any[]>> = {};
let port = 9400;
for (let round = 0; round < rounds; round++) {
  const order = round % 2 === 0 ? adapters : [...adapters].reverse();
  for (const workload of Object.keys(workloads)) {
    for (const adapter of order) {
      const s = await sample(adapter, workload, port++);
      ((results[adapter.id] ??= {})[workload] ??= []).push(s);
      process.stderr.write(`${round} ${workload} ${adapter.id} ${s.ok ? s.ms.toFixed(0) + "ms" : "FAIL " + (s.error ?? s.errors?.[0] ?? "")}\n`);
    }
  }
}
server.stop(true);

async function gzipSize(adapter: Adapter) {
  const entry = join(out, `size-${adapter.id}.js`);
  writeFileSync(entry, adapter.sizeEntry);
  const bundle = await Bun.$`bunx esbuild ${entry} --bundle --minify --format=esm --loader:.wasm=binary --log-level=error`.cwd(root).arrayBuffer();
  return Bun.gzipSync(new Uint8Array(bundle), { level: 9 }).length;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const browserVersion = (await Bun.$`${binary} --version`.text()).trim();
const workloadInfo = { "scroll-flood": "100,000 lines of 88 chars", "full-redraw": "1,500 full-screen frames, colored, cursor home each frame", "sgr-tokens": "100,000 short green SGR runs" };
const terminals = [];
for (const a of adapters) {
  const all = Object.values(results[a.id]).flat();
  const timings: Record<string, { medianMs: number | null; samplesMs: number[]; failures: number }> = {};
  for (const w of Object.keys(workloads)) {
    const ss = results[a.id][w];
    const good = ss.filter((s) => s.ok);
    timings[w] = { medianMs: good.length === ss.length ? Math.round(median(good.map((s) => s.ms))) : null, samplesMs: ss.map((s) => (s.ok ? Math.round(s.ms) : -1)), failures: ss.length - good.length };
  }
  terminals.push({
    id: a.id,
    version: a.version,
    timings,
    mountMs: Math.round(median(all.filter((s) => s.ok).map((s) => s.mountMs))),
    heapMB: Math.round(median(results[a.id]["scroll-flood"].filter((s) => s.ok && s.heap).map((s) => s.heap))),
    gzipBytes: await gzipSize(a),
    textInDom: all.every((s) => s.textInDom),
    canvas: all.some((s) => s.canvas),
    renderer: results[a.id]["full-redraw"].find((s) => s.renderer)?.renderer ?? null,
  });
}
const cpu = (await Bun.$`sysctl -n machdep.cpu.brand_string`.nothrow().text()).trim() || process.arch;
const published = { generatedAt: new Date().toISOString(), rounds, browser: browserVersion, gpu: "SwiftShader (software WebGL)", machine: `${cpu}, ${process.platform}`, grid: `${cols}x${rows}`, workloads: workloadInfo, terminals };
writeFileSync(join(root, "src/lib/bench-results.json"), JSON.stringify(published, null, 2) + "\n");
console.table(terminals.map((t) => ({ id: t.id, version: t.version, ...Object.fromEntries(Object.entries(t.timings).map(([k, v]) => [k, v.medianMs])), mountMs: t.mountMs, heapMB: t.heapMB, gzipKB: +(t.gzipBytes / 1024).toFixed(1), textInDom: t.textInDom, canvas: t.canvas })));
