import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { adapters, freePort, root, type Adapter } from "./adapters";
import { cols, rows, scrollback, workloads, type WorkloadKind } from "./workloads";

const out = join(import.meta.dir, ".out");
mkdirSync(out, { recursive: true });

const html = (adapter: Adapter) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}#host{width:${cols * 9}px;height:${rows * 18}px}</style></head>
<body><div id="host"></div><script type="module" src="./page-${adapter.id}.ts"></script></body></html>`;

const script = (adapter: Adapter) => `import '@xterm/xterm/css/xterm.css';
const host = document.getElementById('host');
const workloads = ${JSON.stringify(workloads)};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
function bufferText(t) { const b = t.buffer?.active; if (!b) return ''; let s = ''; for (let i = Math.max(0, b.length - 45); i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\\n'; return s; }
function bufferScreen(t) { const b = t.buffer?.active; if (!b) return []; const out = []; for (let i = 0; i < t.rows; i++) out.push(b.getLine(b.baseY + i)?.translateToString(true) ?? ''); return out; }
async function make(): Promise<any> { ${adapter.setup} }
async function settle(t, marker, deadline) {
  while (performance.now() < deadline) { await nextFrame(); if (String(t.text()).includes(marker)) return true; }
  return false;
}
async function writeChunked(t, input) {
  const pending = [];
  for (let i = 0; i < input.length; i += 16384) pending.push(t.write(input.slice(i, i + 16384)));
  await Promise.all(pending);
}
(window as any).run = async (name) => {
  const w = workloads[name];
  host.innerHTML = '';
  host.style.width = '${cols * 9}px';
  host.style.height = '${rows * 18}px';
  const m0 = performance.now();
  const t = await make();
  await nextFrame();
  const mountMs = performance.now() - m0;
  const sz = t.size ? t.size() : { cols: ${cols}, rows: ${rows} };
  const t0 = performance.now();
  let p95FrameMs = null;
  let droppedFrames = null;
  performance.mark('termlab-bench-start');
  if (w.kind === 'resize') {
    await writeChunked(t, w.input);
    for (const [c, r] of w.resizes) {
      t.resize?.(c, r);
      await nextFrame();
    }
    await t.write('\\r\\n' + w.marker);
  } else if (w.kind === 'paced') {
    const deltas = [];
    let prev = performance.now();
    for (const chunk of w.chunks) {
      await t.write(chunk);
      await nextFrame();
      const now = performance.now();
      deltas.push(now - prev);
      prev = now;
    }
    await t.write('\\r\\n' + w.marker);
    const sorted = [...deltas].sort((a, b) => a - b);
    p95FrameMs = Math.round((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0) * 100) / 100;
    droppedFrames = deltas.filter((d) => d > 20).length;
  } else {
    await writeChunked(t, w.input);
  }
  let ok = false;
  let failure = '';
  try { ok = await settle(t, w.marker, t0 + 30000); if (!ok) failure = 'end marker not found within 30s; tail: ' + JSON.stringify(String(t.text()).slice(-160)); } catch (e) { failure = 'text probe threw: ' + String(e); }
  await nextFrame();
  await nextFrame();
  performance.mark('termlab-bench-end');
  const ms = performance.now() - t0;
  (window as any).gc?.();
  await nextFrame();
  const mem = (performance as any).memory;
  const heap = mem ? mem.usedJSHeapSize / 1048576 : null;
  const textInDom = String(host.innerText).includes(w.marker);
  const canvas = host.querySelector('canvas') !== null;
  const renderer = typeof (window as any).__renderer === 'function' ? (window as any).__renderer() : (window as any).__renderer ?? null;
  try { t.destroy(); } catch {}
  return { ok, error: failure || undefined, ms, mountMs, heap, textInDom, canvas, renderer, grid: sz.cols + 'x' + sz.rows, p95FrameMs, droppedFrames };
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

async function sampleOnce(adapter: Adapter, workload: string, port: number, traced: boolean) {
  const chrome = spawn(binary, [`--remote-debugging-port=${port}`, "--enable-precise-memory-info", "--js-flags=--expose-gc", ...gpuFlags, "--window-size=1600,1100", "about:blank"], { stdio: "ignore" });
  const deadline = setTimeout(() => { chrome.kill("SIGKILL"); }, 65000);
  try {
    let ws = "";
    for (let i = 0; i < 80 && !ws; i++) {
      try { ws = ((await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as any[]).find((t) => t.type === "page")?.webSocketDebuggerUrl ?? ""; } catch {}
      if (!ws) await Bun.sleep(100);
    }
    if (!ws) return { ok: false, ms: NaN, error: "chrome debugger never opened", errors: [] };
    const sock = new WebSocket(ws);
    await new Promise<void>((resolve, reject) => {
      sock.addEventListener("open", () => resolve(), { once: true });
      sock.addEventListener("error", () => reject(new Error("websocket open failed")), { once: true });
      sock.addEventListener("close", () => reject(new Error("websocket closed before open")), { once: true });
    });
    let id = 0;
    const waiting = new Map<number, (v: any) => void>();
    const errors: string[] = [];
    const trace: any[] = [];
    let traceComplete: (() => void) | undefined;
    sock.addEventListener("close", () => {
      for (const resolve of waiting.values()) resolve({ error: { message: "chrome closed" } });
      waiting.clear();
      traceComplete?.();
    });
    sock.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(" ").slice(0, 300));
      if (m.id) { waiting.get(m.id)?.(m); waiting.delete(m.id); }
      if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === "Tracing.dataCollected") trace.push(...m.params.value);
      if (m.method === "Tracing.tracingComplete") traceComplete?.();
    });
    const send = (method: string, params: object = {}) => new Promise<any>((r) => {
      if (sock.readyState !== WebSocket.OPEN) { r({ error: { message: "socket not open" } }); return; }
      const i = ++id;
      waiting.set(i, r);
      sock.send(JSON.stringify({ id: i, method, params }));
    });
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/${adapter.id}` });
    let ready = false;
    for (let i = 0; i < 150 && !ready; i++) {
      const r = await send("Runtime.evaluate", { expression: "window.ready === true", returnByValue: true });
      if (r.error) break;
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
    await Promise.race([complete, Bun.sleep(15000)]);
    const metrics = traceMetrics(trace);
    if (value.ok && (metrics.cpuMs <= 0 || metrics.cpuMs > value.ms + 15)) {
      value.ok = false;
      value.error = `trace self-check failed: cpuMs ${metrics.cpuMs}ms, wall ${value.ms.toFixed(1)}ms`;
    }
    sock.close();
    return { ...value, ...metrics, errors };
  } catch (error) {
    return { ok: false, ms: NaN, error: String(error), errors: [] };
  } finally {
    clearTimeout(deadline);
    chrome.kill("SIGKILL");
  }
}

async function sample(adapter: Adapter, workload: string, port: number, traced: boolean) {
  const first = await sampleOnce(adapter, workload, port, traced);
  if (first.ok) return first;
  return await sampleOnce(adapter, workload, freePort(), traced);
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
const selectedWorkloads = process.env.BENCH_WORKLOADS ? process.env.BENCH_WORKLOADS.split(",").filter((w) => w in workloads) : Object.keys(workloads);
if (onlyIds.length) adapters.splice(0, adapters.length, ...adapters.filter((a) => onlyIds.includes(a.id)));
const results: Record<string, Record<string, any[]>> = {};
const tracedResults: Record<string, Record<string, any[]>> = {};
const traceEnabled = process.env.BENCH_TRACE !== "0";
async function runRounds(destination: Record<string, Record<string, any[]>>, traced: boolean) {
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? adapters : [...adapters].reverse();
    for (const workload of selectedWorkloads) {
      for (const adapter of order) {
        const s = await sample(adapter, workload, freePort(), traced);
        ((destination[adapter.id] ??= {})[workload] ??= []).push(s);
        process.stderr.write(`${traced ? "trace " : ""}${round} ${workload} ${adapter.id} ${s.ok ? s.ms.toFixed(0) + "ms" + (traced ? " cpu=" + s.cpuMs : "") : "FAIL " + (s.error ?? s.errors?.[0] ?? "")}\n`);
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
const workloadInfo = Object.fromEntries(selectedWorkloads.map((id) => [id, workloads[id]!.description]));
const workloadLabels = Object.fromEntries(selectedWorkloads.map((id) => [id, workloads[id]!.label]));
const workloadKinds = Object.fromEntries(selectedWorkloads.map((id) => [id, workloads[id]!.kind])) as Record<string, WorkloadKind>;

const terminals = [];
for (const a of adapters) {
  const all = Object.values(results[a.id]).flat();
  const timings: Record<string, any> = {};
  const traceOverheadPct: Record<string, number | null> = {};
  for (const w of selectedWorkloads) {
    const ss = results[a.id][w];
    const traceSamples = tracedResults[a.id]?.[w] ?? [];
    const good = ss.filter((s) => s.ok);
    const tracedGood = traceSamples.filter((s) => s.ok);
    const summary = (key: string) => {
      const values = tracedGood.map((s) => s[key]).filter((v) => typeof v === "number");
      return { medianMs: tracedGood.length === traceSamples.length && values.length ? Math.round(median(values) * 100) / 100 : null, minMs: values.length ? Math.round(Math.min(...values) * 100) / 100 : null, maxMs: values.length ? Math.round(Math.max(...values) * 100) / 100 : null };
    };
    const wallMedian = good.length === ss.length ? median(good.map((s) => s.ms)) : NaN;
    const tracedWallMedian = tracedGood.length === traceSamples.length && traceSamples.length ? median(tracedGood.map((s) => s.ms)) : NaN;
    traceOverheadPct[w] = Number.isFinite(wallMedian) && Number.isFinite(tracedWallMedian) ? Math.round((tracedWallMedian / wallMedian - 1) * 1000) / 10 : null;
    const p95Values = good.map((s) => s.p95FrameMs).filter((v) => typeof v === "number");
    const droppedValues = good.map((s) => s.droppedFrames).filter((v) => typeof v === "number");
    timings[w] = {
      medianMs: Number.isFinite(wallMedian) ? Math.round(wallMedian) : null,
      samplesMs: ss.map((s) => (s.ok ? Math.round(s.ms) : -1)),
      failures: ss.length - good.length,
      cpuMs: summary("cpuMs"),
      scriptMs: summary("scriptMs"),
      styleLayoutMs: summary("styleLayoutMs"),
      paintMs: summary("paintMs"),
      frames: summary("frames"),
      longestTaskMs: summary("longestTaskMs"),
      ...(p95Values.length ? { p95FrameMs: Math.round(median(p95Values) * 100) / 100, droppedFrames: Math.round(median(droppedValues)) } : {}),
    };
  }
  const heapPool = results[a.id]["scroll-flood"] ?? all;
  const rendererPool = results[a.id]["full-redraw"] ?? all;
  terminals.push({
    id: a.id,
    version: a.version,
    probe: a.probe,
    grid: all.find((s) => s.grid)?.grid ?? `${cols}x${rows}`,
    timings,
    traceOverheadPct,
    mountMs: Math.round(median(all.filter((s) => s.ok).map((s) => s.mountMs))),
    heapMB: Math.round(median(heapPool.filter((s) => s.ok && s.heap).map((s) => s.heap))),
    gzipBytes: await gzipSize(a),
    textInDom: all.every((s) => s.textInDom),
    canvas: all.some((s) => s.canvas),
    renderer: rendererPool.find((s) => s.renderer)?.renderer ?? null,
    unverifiedTiming: a.unverifiedTiming ?? null,
  });
}
const cpu = (await Bun.$`sysctl -n machdep.cpu.brand_string`.nothrow().text()).trim() || process.arch;
const gpuName = "hardware GPU, ANGLE Metal (" + ((await Bun.$`system_profiler SPDisplaysDataType`.nothrow().text()).match(new RegExp("Chipset Model: (.*)"))?.[1]?.trim() ?? "unknown") + ")";
const published = {
  generatedAt: new Date().toISOString(),
  rounds,
  browser: browserVersion,
  gpu: gpuMode === "software" ? "SwiftShader (software WebGL)" : gpuName,
  machine: `${cpu}, ${process.platform}`,
  grid: `${cols}x${rows}`,
  scrollback,
  workloads: workloadInfo,
  workloadLabels,
  workloadKinds,
  terminals,
};
const partial = onlyIds.length > 0 || Boolean(process.env.BENCH_WORKLOADS);
writeFileSync(join(partial ? out : join(root, "src/lib"), "bench-results.json"), JSON.stringify(published, null, 2) + "\n");
console.table(terminals.map((t) => ({ id: t.id, grid: t.grid, probe: t.probe, ...Object.fromEntries(Object.entries(t.timings).map(([k, v]) => [k, `${v.cpuMs?.medianMs ?? "?"}c/${v.medianMs}w`])), mountMs: t.mountMs, gzipKB: +(t.gzipBytes / 1024).toFixed(1) })));
