import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Adapter = { id: string; version: string; sizeEntry: string; setup: string; extraAssets?: string[]; unverifiedTiming?: string };

const root = join(import.meta.dir, "..");
const out = join(import.meta.dir, ".out");
mkdirSync(out, { recursive: true });
const pkg = (name: string) => JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version as string;

const cloudtermTag = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies.cloudterm.split("#")[1] ?? pkg("cloudterm");

const adapters: Adapter[] = [
  {
    id: "cloudterm",
    version: cloudtermTag,
    sizeEntry: "import { mount } from 'cloudterm'; console.log(mount);",
    setup: `
      const { mount } = await import('cloudterm');
      const t = await mount(host, { onData() {}, predictionMode: 'off' });
      return { write: (s) => t.write(s), text: () => [...host.querySelectorAll('.cloudterm-line')].map((l) => l.textContent).join('\\n'), destroy: () => t.destroy() };`,
  },
  {
    id: "cloudterm-perf",
    version: "main " + (JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies["cloudterm-perf"].split("#")[1] ?? "?"),
    sizeEntry: "import { mount } from 'cloudterm-perf'; console.log(mount);",
    setup: `
      const { mount } = await import('cloudterm-perf');
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
    id: "xterm-dom-beta",
    version: pkg("@xterm/xterm-beta"),
    sizeEntry: "import { Terminal } from '@xterm/xterm-beta'; console.log(Terminal);",
    setup: `
      const { Terminal } = await import('@xterm/xterm-beta');
      const t = new Terminal({ cols: 120, rows: 40, scrollback: 10000 });
      t.open(host);
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
  performance.mark('termlab-bench-start');
  const pending = []; for (let i = 0; i < w.input.length; i += 16384) pending.push(t.write(w.input.slice(i, i + 16384))); await Promise.all(pending);
  let ok = false;
  let failure = '';
  try { ok = await settle(t, w.marker, t0 + 30000); if (!ok) failure = 'end marker not found within 30s; tail: ' + JSON.stringify(String(t.text()).slice(-160)); } catch (e) { failure = 'text probe threw: ' + String(e); }
  performance.mark('termlab-bench-end');
  await nextFrame();
  await nextFrame();
  const ms = performance.now() - t0;
  (window as any).gc?.();
  await nextFrame();
  const mem = (performance as any).memory;
  const heap = mem ? mem.usedJSHeapSize / 1048576 : null;
  const textInDom = String(host.innerText).includes(w.marker);
  const canvas = host.querySelector('canvas') !== null;
  try { t.destroy(); } catch {}
  return { ok, error: failure || undefined, ms, mountMs, heap, textInDom, canvas, renderer: typeof (window as any).__renderer === 'function' ? (window as any).__renderer() : (window as any).__renderer ?? null };
};
(window as any).ready = true;
`;

const gpuMode = process.env.BENCH_GPU === "software" ? "software" : "hardware";
const gpuFlags = gpuMode === "software" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu"];
const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop()!;
const binary = join(cacheDir, shellDir, readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-headless-shell"))!, "chrome-headless-shell");

for (const adapter of adapters) { writeFileSync(join(out, `page-${adapter.id}.html`), html(adapter)); writeFileSync(join(out, `page-${adapter.id}.ts`), script(adapter)); }
const routes: Record<string, unknown> = {};
for (const a of adapters) routes[`/${a.id}`] = (await import(join(out, `page-${a.id}.html`))).default;
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", development: false, routes: routes as any });

async function sample(adapter: Adapter, workload: string, port: number, traced: boolean) {
  const chrome = spawn(binary, [`--remote-debugging-port=${port}`, "--enable-precise-memory-info", "--js-flags=--expose-gc", ...gpuFlags, "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
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
    const trace: any[] = [];
    let traceComplete: (() => void) | undefined;
    sock.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(" ").slice(0, 300));
      if (m.id) waiting.get(m.id)?.(m);
      if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === "Tracing.dataCollected") trace.push(...m.params.value);
      if (m.method === "Tracing.tracingComplete") traceComplete?.();
    });
    const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++id; waiting.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/${adapter.id}` });
    let ready = false;
    for (let i = 0; i < 150 && !ready; i++) {
      const r = await send("Runtime.evaluate", { expression: "window.ready === true", returnByValue: true });
      ready = r.result?.result?.value === true;
      if (!ready) await Bun.sleep(100);
    }
    if (!ready) { sock.close(); return { ok: false, ms: NaN, error: "page never became ready", errors }; }
    if (traced) await send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing", transferMode: "ReportEvents" });
    const r = await send("Runtime.evaluate", { expression: `run(${JSON.stringify(workload)})`, awaitPromise: true, returnByValue: true, timeout: 60000 });
    const value = r.result?.result?.value ?? { ok: false, ms: NaN, error: JSON.stringify(r.result?.exceptionDetails ?? r).slice(0, 300) };
    if (!traced) {
      sock.close();
      return { ...value, errors };
    }
    const complete = new Promise<void>((resolve) => { traceComplete = resolve; });
    await send("Tracing.end");
    await complete;
    const metrics = traceMetrics(trace);
    if (value.ok && (metrics.cpuMs <= 0 || metrics.cpuMs > value.ms + 5)) {
      value.ok = false;
      value.error = `trace self-check failed: cpuMs ${metrics.cpuMs}ms, wall ${value.ms.toFixed(1)}ms`;
    }
    sock.close();
    return { ...value, ...metrics, errors };
  } finally {
    chrome.kill("SIGKILL");
  }
}

const traceMetrics = (events: any[]) => {
  const mainThread = new Set(events.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain").map((e) => `${e.pid}:${e.tid}`));
  const mark = (name: string) => events.find((e) => e.name === name)?.ts;
  const start = mark("termlab-bench-start");
  const end = mark("termlab-bench-end");
  const inWindow = (e: any) => typeof start === "number" && typeof end === "number" && e.ts < end && e.ts + (e.dur ?? 0) > start;
  const clippedMs = (e: any) => (Math.min(e.ts + e.dur, end) - Math.max(e.ts, start)) / 1000;
  const duration = (names: string[]) => events.filter((e) => mainThread.has(`${e.pid}:${e.tid}`) && e.ph === "X" && names.includes(e.name) && inWindow(e)).reduce((sum, e) => sum + clippedMs(e), 0);
  const tasks = events.filter((e) => mainThread.has(`${e.pid}:${e.tid}`) && e.ph === "X" && ["RunTask", "ThreadControllerImpl::RunTask"].includes(e.name) && inWindow(e));
  return {
    cpuMs: Math.round(tasks.reduce((sum, e) => sum + clippedMs(e), 0) * 100) / 100,
    scriptMs: Math.round(duration(["FunctionCall", "EvaluateScript", "RunMicrotasks"]) * 100) / 100,
    styleLayoutMs: Math.round(duration(["UpdateLayoutTree", "Layout", "RecalculateStyles"]) * 100) / 100,
    paintMs: Math.round(duration(["Paint", "PrePaint", "Layerize", "Commit"]) * 100) / 100,
    frames: events.filter((e) => mainThread.has(`${e.pid}:${e.tid}`) && e.name === "FireAnimationFrame" && inWindow(e)).length,
    longestTaskMs: Math.round(Math.max(0, ...tasks.map(clippedMs)) * 100) / 100,
  };
};

const rounds = Number(process.argv[2] ?? 5);
const onlyIds = process.argv.slice(3);
if (onlyIds.length) adapters.splice(0, adapters.length, ...adapters.filter((a) => onlyIds.includes(a.id)));
const results: Record<string, Record<string, any[]>> = {};
const tracedResults: Record<string, Record<string, any[]>> = {};
const traceEnabled = process.env.BENCH_TRACE !== "0";
let port = 9400;
async function runRounds(destination: Record<string, Record<string, any[]>>, traced: boolean) {
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? adapters : [...adapters].reverse();
    for (const workload of Object.keys(workloads)) {
      for (const adapter of order) {
        const s = await sample(adapter, workload, port++, traced);
        ((destination[adapter.id] ??= {})[workload] ??= []).push(s);
        process.stderr.write(`${traced ? "trace " : ""}${round} ${workload} ${adapter.id} ${s.ok ? s.ms.toFixed(0) + "ms" : "FAIL " + (s.error ?? s.errors?.[0] ?? "")}\n`);
      }
    }
  }
}
await runRounds(results, false);
if (traceEnabled) await runRounds(tracedResults, true);
server.stop(true);

async function gzipSize(adapter: Adapter) {
  const entry = join(out, `size-${adapter.id}.js`);
  writeFileSync(entry, adapter.sizeEntry);
  const bundle = await Bun.$`bunx esbuild ${entry} --bundle --minify --format=esm --loader:.wasm=binary --log-level=error`.cwd(root).arrayBuffer();
  let bytes = Bun.gzipSync(new Uint8Array(bundle), { level: 9 }).length;
  for (const asset of adapter.extraAssets ?? []) bytes += Bun.gzipSync(new Uint8Array(readFileSync(join(root, "node_modules", asset))), { level: 9 }).length;
  return bytes;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const browserVersion = (await Bun.$`${binary} --version`.text()).trim();
const workloadInfo = { "scroll-flood": "100,000 lines of 88 chars", "full-redraw": "1,500 full-screen frames, colored, cursor home each frame", "sgr-tokens": "100,000 short green SGR runs" };
const terminals = [];
for (const a of adapters) {
  const all = Object.values(results[a.id]).flat();
  const timings: Record<string, any> = {};
  const traceOverheadPct: Record<string, number | null> = {};
  for (const w of Object.keys(workloads)) {
    const ss = results[a.id][w];
    const traceSamples = tracedResults[a.id]?.[w] ?? [];
    const good = ss.filter((s) => s.ok);
    const tracedGood = traceSamples.filter((s) => s.ok);
    const summary = (key: string) => {
      const values = tracedGood.map((s) => s[key]);
      return { medianMs: tracedGood.length === traceSamples.length && values.length ? Math.round(median(values) * 100) / 100 : null, minMs: values.length ? Math.round(Math.min(...values) * 100) / 100 : null, maxMs: values.length ? Math.round(Math.max(...values) * 100) / 100 : null };
    };
    const wallMedian = good.length === ss.length ? median(good.map((s) => s.ms)) : NaN;
    const tracedWallMedian = tracedGood.length === traceSamples.length && traceSamples.length ? median(tracedGood.map((s) => s.ms)) : NaN;
    traceOverheadPct[w] = Number.isFinite(wallMedian) && Number.isFinite(tracedWallMedian) ? Math.round((tracedWallMedian / wallMedian - 1) * 1000) / 10 : null;
    timings[w] = { medianMs: Number.isFinite(wallMedian) ? Math.round(wallMedian) : null, samplesMs: ss.map((s) => (s.ok ? Math.round(s.ms) : -1)), failures: ss.length - good.length, cpuMs: summary("cpuMs"), scriptMs: summary("scriptMs"), styleLayoutMs: summary("styleLayoutMs"), paintMs: summary("paintMs"), frames: summary("frames"), longestTaskMs: summary("longestTaskMs") };
  }
  terminals.push({
    id: a.id,
    version: a.version,
    timings,
    traceOverheadPct,
    mountMs: Math.round(median(all.filter((s) => s.ok).map((s) => s.mountMs))),
    heapMB: Math.round(median(results[a.id]["scroll-flood"].filter((s) => s.ok && s.heap).map((s) => s.heap))),
    gzipBytes: await gzipSize(a),
    textInDom: all.every((s) => s.textInDom),
    canvas: all.some((s) => s.canvas),
    renderer: results[a.id]["full-redraw"].find((s) => s.renderer)?.renderer ?? null,
    unverifiedTiming: a.unverifiedTiming ?? null,
  });
}
const cpu = (await Bun.$`sysctl -n machdep.cpu.brand_string`.nothrow().text()).trim() || process.arch;
const gpuName = "hardware GPU, ANGLE Metal (" + ((await Bun.$`system_profiler SPDisplaysDataType`.nothrow().text()).match(/Chipset Model: (.*)/)?.[1]?.trim() ?? "unknown") + ")";
const published = { generatedAt: new Date().toISOString(), rounds, browser: browserVersion, gpu: gpuMode === "software" ? "SwiftShader (software WebGL)" : gpuName, machine: `${cpu}, ${process.platform}`, grid: `${cols}x${rows}`, workloads: workloadInfo, terminals };
writeFileSync(join(onlyIds.length ? out : join(root, "src/lib"), "bench-results.json"), JSON.stringify(published, null, 2) + "\n");
console.table(terminals.map((t) => ({ id: t.id, version: t.version, ...Object.fromEntries(Object.entries(t.timings).map(([k, v]) => [k, v.medianMs])), mountMs: t.mountMs, heapMB: t.heapMB, gzipKB: +(t.gzipBytes / 1024).toFixed(1), textInDom: t.textInDom, canvas: t.canvas })));
console.table(terminals.map((t) => ({ id: t.id, ...Object.fromEntries(Object.entries(t.traceOverheadPct).map(([workload, overhead]) => [workload, overhead == null ? "n/a" : `${overhead}%`])) })));
