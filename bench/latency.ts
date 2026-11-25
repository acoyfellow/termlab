import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { adapters, freePort, root, type Adapter } from "./adapters";

const out = join(import.meta.dir, ".out");
mkdirSync(out, { recursive: true });

const defaultSetup = (adapter: Adapter) =>
  adapter.id === "cloudterm"
    ? adapter.setup.replace(", predictionMode: 'off'", "")
    : adapter.setup;

const html = (adapter: Adapter) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}#host{width:1080px;height:720px}</style></head>
<body><div id="host"></div><script type="module" src="./lat-${adapter.id}.ts"></script></body></html>`;

const domTextIds = new Set(["cloudterm", "xterm-dom", "xterm-dom-beta", "wterm"]);
const script = (adapter: Adapter) => `import '@xterm/xterm/css/xterm.css';
const host = document.getElementById('host');
const useDomProbe = ${domTextIds.has(adapter.id)};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
function bufferText(t) { const b = t.buffer?.active; if (!b) return ''; let s = ''; for (let i = Math.max(0, b.length - 45); i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\\n'; return s; }
function bufferScreen(t) { const b = t.buffer?.active; if (!b) return []; const out = []; for (let i = 0; i < t.rows; i++) out.push(b.getLine(b.baseY + i)?.translateToString(true) ?? ''); return out; }
let activeTerm: any = null;
(window as any).__axInput = (d) => {
  const s = String(d);
  if (activeTerm && s >= ' ') activeTerm.write(s);
};
async function make(): Promise<any> { ${defaultSetup(adapter)} }
async function settleFrames() { await nextFrame(); await nextFrame(); }

let keyStart = 0;
window.addEventListener('keydown', () => {
  keyStart = performance.now();
  performance.mark('lat-key-start');
}, true);

(window as any).latMount = async (withScrollback: boolean) => {
  host.innerHTML = '';
  host.style.width = '1080px';
  host.style.height = '720px';
  activeTerm = await make();
  await settleFrames();
  if (withScrollback) {
    const lines = Array.from({ length: 5000 }, (_, i) => 'sb-line-' + i + ' ' + 'x'.repeat(60)).join('\\r\\n') + '\\r\\n$ ';
    for (let i = 0; i < lines.length; i += 16384) await activeTerm.write(lines.slice(i, i + 16384));
  } else {
    await activeTerm.write('$ ');
  }
  await settleFrames();
  await new Promise((r) => setTimeout(r, 80));
};

(window as any).latFocusRect = () => {
  const r = host.getBoundingClientRect();
  return { x: r.left + 80, y: r.top + 80 };
};

(window as any).latWaitDisplayed = async (needle: string) => {
  const deadline = performance.now() + 2000;
  let readyMs = null;
  while (performance.now() < deadline) {
    const txt = useDomProbe ? String(host.innerText) : String(activeTerm.text());
    if (txt.includes(needle)) {
      readyMs = performance.now() - keyStart;
      performance.mark('lat-ready');
      break;
    }
    await new Promise((r) => setTimeout(r, 1));
  }
  await nextFrame();
  await nextFrame();
  performance.mark('lat-key-end');
  return { ok: readyMs !== null, readyMs };
};
(window as any).ready = true;
`;

const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop()!;
const binary = join(cacheDir, shellDir, readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-headless-shell"))!, "chrome-headless-shell");

const onlyIds = process.argv.slice(2);
const selected = onlyIds.length ? adapters.filter((a) => onlyIds.includes(a.id)) : adapters;

for (const adapter of selected) {
  writeFileSync(join(out, `lat-${adapter.id}.html`), html(adapter));
  writeFileSync(join(out, `lat-${adapter.id}.ts`), script(adapter));
}
const routes: Record<string, unknown> = {};
for (const a of selected) routes[`/${a.id}`] = (await import(join(out, `lat-${a.id}.html`))).default;
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", development: false, routes: routes as any });

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.floor(s.length / 2)]! * 100) / 100 : null;
};
const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]! * 100) / 100 : null;
};

function traceKeyMetrics(events: any[], useDom: boolean) {
  const mainThread = new Set(events.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain").map((e) => `${e.pid}:${e.tid}`));
  const starts = events.filter((e) => e.name === "lat-key-start").map((e) => e.ts);
  const readies = events.filter((e) => e.name === "lat-ready").map((e) => e.ts);
  const ends = events.filter((e) => e.name === "lat-key-end").map((e) => e.ts);
  const tasks = events.filter((e) => mainThread.has(`${e.pid}:${e.tid}`) && e.ph === "X" && ["RunTask", "ThreadControllerImpl::RunTask"].includes(e.name));
  const commits = events.filter((e) => mainThread.has(`${e.pid}:${e.tid}`) && e.ph === "X" && e.name === "Commit").map((e) => ({ start: e.ts, end: e.ts + (e.dur ?? 0) }));
  const rafs = events.filter((e) => mainThread.has(`${e.pid}:${e.tid}`) && e.name === "FireAnimationFrame").map((e) => e.ts);
  const perKeyCpu: number[] = [];
  const perKeyDisplay: number[] = [];
  const count = Math.min(starts.length, ends.length);
  for (let i = 0; i < count; i++) {
    const s = starts[i]!;
    const e = ends[i]!;
    const r = readies.find((t) => t >= s && t <= e);
    const cpu = tasks.filter((t) => t.ts < e && t.ts + (t.dur ?? 0) > s).reduce((sum, t) => sum + (Math.min(t.ts + t.dur, e) - Math.max(t.ts, s)) / 1000, 0);
    perKeyCpu.push(cpu);
    if (r === undefined) continue;
    const gate = useDom ? r : (rafs.find((t) => t >= r && t <= e) ?? r);
    const commit = commits.find((c) => c.end >= gate && c.start <= e + 20000);
    if (commit) perKeyDisplay.push((commit.end - s) / 1000);
  }
  return { keyCpuMedianMs: median(perKeyCpu), keyCpuP95Ms: p95(perKeyCpu), displayMedianMs: median(perKeyDisplay), displayP95Ms: p95(perKeyDisplay) };
}

async function measureMode(adapter: Adapter, withScrollback: boolean) {
  const port = freePort();
  const chrome = spawn(binary, [`--remote-debugging-port=${port}`, "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu", "--window-size=1600,1100", "about:blank"], { stdio: "ignore" });
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
    const trace: any[] = [];
    let traceComplete: (() => void) | undefined;
    sock.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id) waiting.get(m.id)?.(m);
      if (m.method === "Tracing.dataCollected") trace.push(...m.params.value);
      if (m.method === "Tracing.tracingComplete") traceComplete?.();
    });
    const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++id; waiting.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expression: string) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 30000 })).result?.result?.value;
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/${adapter.id}` });
    let ready = false;
    for (let i = 0; i < 150 && !ready; i++) {
      ready = (await ev("window.ready === true")) === true;
      if (!ready) await Bun.sleep(50);
    }
    if (!ready) throw new Error("page never became ready");
    await ev(`latMount(${withScrollback})`);
    const rect = await ev("latFocusRect()");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await Bun.sleep(80);

    await send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing", transferMode: "ReportEvents" });

    const chars = "abcdefghijklmnopqrst";
    const readySamples: number[] = [];
    let typed = "";
    let failures = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]!;
      typed += ch;
      const vk = ch.toUpperCase().charCodeAt(0);
      const waitP = ev(`latWaitDisplayed(${JSON.stringify(typed)})`);
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: ch, code: "Key" + ch.toUpperCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await send("Input.dispatchKeyEvent", { type: "char", text: ch, unmodifiedText: ch, key: ch });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch, code: "Key" + ch.toUpperCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      const res = await waitP;
      if (res?.ok && typeof res.readyMs === "number") {
        readySamples.push(res.readyMs);
      } else {
        failures++;
      }
      await Bun.sleep(23 + (i % 7) * 5);
    }

    const done = new Promise<void>((resolve) => { traceComplete = resolve; });
    await send("Tracing.end");
    await done;
    sock.close();
    const traced = traceKeyMetrics(trace, domTextIds.has(adapter.id));
    return {
      samples: chars.length,
      failures,
      readyMedianMs: median(readySamples),
      ...traced,
    };
  } finally {
    chrome.kill("SIGKILL");
  }
}

const terminals = [];
for (const adapter of selected) {
  const clean = await measureMode(adapter, false);
  const loaded = await measureMode(adapter, true);
  process.stderr.write(`latency ${adapter.id}: clean=${clean.displayMedianMs}ms (cpu ${clean.keyCpuMedianMs}ms) | 5k-sb=${loaded.displayMedianMs}ms (cpu ${loaded.keyCpuMedianMs}ms)\n`);
  terminals.push({ id: adapter.id, version: adapter.version, probe: adapter.probe, unverifiedTiming: adapter.unverifiedTiming ?? null, clean, scrollback5k: loaded });
}
server.stop(true);

const browserVersion = (await Bun.$`${binary} --version`.text()).trim();
const published = {
  generatedAt: new Date().toISOString(),
  browser: browserVersion,
  keysPerMode: 20,
  terminals,
};
writeFileSync(join(onlyIds.length ? out : join(root, "src/lib"), "latency-results.json"), JSON.stringify(published, null, 2) + "\n");
console.table(terminals.map((t) => ({
  id: t.id,
  probe: t.probe,
  cleanDisplayMs: t.clean.displayMedianMs,
  cleanP95Ms: t.clean.displayP95Ms,
  cleanKeyCpuMs: t.clean.keyCpuMedianMs,
  sb5kDisplayMs: t.scrollback5k.displayMedianMs,
  sb5kKeyCpuMs: t.scrollback5k.keyCpuMedianMs,
  fail: t.clean.failures + t.scrollback5k.failures,
})));
