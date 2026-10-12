import { spawn } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const id = process.argv[2] ?? "cloudterm";
const workload = process.argv[3] ?? "full-redraw";
const out = join(import.meta.dir, ".out");
const routes: Record<string, unknown> = { "/p": (await import(join(out, `page-${id}.html`))).default };
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", development: false, routes: routes as any });
const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop()!;
const binary = join(cacheDir, shellDir, readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-headless-shell"))!, "chrome-headless-shell");
const chrome = spawn(binary, ["--remote-debugging-port=9570", "--use-angle=metal", "--enable-gpu", "about:blank"], { stdio: "ignore" });
let ws = "";
for (let i = 0; i < 80 && !ws; i++) {
    try {
        ws = ((await (await fetch("http://127.0.0.1:9570/json")).json()) as any[]).find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
    }
    catch { }
    if (!ws)
        await Bun.sleep(100);
}
const sock = new WebSocket(ws);
await new Promise((r) => sock.addEventListener("open", r, { once: true }));
let n = 0;
const waiting = new Map<number, (v: any) => void>();
const trace: any[] = [];
sock.addEventListener("message", (e) => { const m = JSON.parse(String(e.data)); if (m.id)
    waiting.get(m.id)?.(m); if (m.method === "Tracing.dataCollected")
    trace.push(...m.params.value); if (m.method === "Tracing.tracingComplete")
    waiting.get(-1)?.(m); });
const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++n; waiting.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");
await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/p` });
for (let i = 0; i < 100; i++) {
    const r = await send("Runtime.evaluate", { expression: "window.ready === true", returnByValue: true });
    if (r.result?.result?.value)
        break;
    await Bun.sleep(100);
}
await send("Runtime.evaluate", { expression: `run(${JSON.stringify(workload)})`, awaitPromise: true });
await send("Profiler.enable");
await send("Profiler.setSamplingInterval", { interval: 100 });
await send("Tracing.start", { categories: "devtools.timeline,blink,v8", transferMode: "ReportEvents" });
await send("Profiler.start");
const r = await send("Runtime.evaluate", { expression: `run(${JSON.stringify(workload)})`, awaitPromise: true, returnByValue: true });
const prof = await send("Profiler.stop");
const done = new Promise((res) => waiting.set(-1, res));
await send("Tracing.end");
await done;
console.log("run", JSON.stringify(r.result.result.value));
const totals = new Map<string, number>();
for (const ev of trace) {
    if (ev.ph !== "X" || !ev.dur)
        continue;
    const name = ev.name;
    if (["Layout", "UpdateLayoutTree", "Paint", "PrePaint", "Layerize", "Commit", "ParseHTML", "FunctionCall", "RunMicrotasks", "FireAnimationFrame", "MajorGC", "MinorGC", "V8.GC_SCAVENGER", "BlinkGC.AtomicPhase", "HitTest", "RecalculateStyles", "UpdateLayerTree", "CompositeLayers"].includes(name))
        totals.set(name, (totals.get(name) ?? 0) + ev.dur / 1000);
}
console.log("trace(ms)", Object.fromEntries([...totals].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +v.toFixed(1)])));
const p = prof.result.profile;
const byId = new Map<number, any>(p.nodes.map((nd: any) => [nd.id, nd]));
const self = new Map<number, number>();
const dt = p.timeDeltas as number[];
(p.samples as number[]).forEach((s, i) => self.set(s, (self.get(s) ?? 0) + (dt[i] ?? 0)));
const agg = new Map<string, number>();
for (const [nid, us] of self) {
    const cf = byId.get(nid).callFrame;
    const key = `${cf.functionName || "(anon)"} ${cf.url.split("/").pop()}:${cf.lineNumber}`;
    agg.set(key, (agg.get(key) ?? 0) + us / 1000);
}
console.log("top self time (ms):");
for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 25))
    console.log(v.toFixed(1).padStart(7), k);
chrome.kill("SIGKILL");
server.stop(true);
process.exit(0);
