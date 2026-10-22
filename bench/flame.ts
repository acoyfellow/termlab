import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { SourceMapConsumer } from "source-map-js";
import { freePort } from "./adapters";
import { cols, rows, workloads } from "./workloads";

type Frame = { functionName: string; url: string; lineNumber: number; columnNumber: number };
type Node = { id: number; callFrame: Frame; children?: number[] };
type Profile = { nodes: Node[]; samples?: number[]; timeDeltas?: number[] };
type Entry = { key: string; fn: string; source: string; self: number; total: number };
type Run = { entries: Entry[]; profile: Profile; path: string };

const profileIterations = 20;

const root = resolve(import.meta.dir, "..");
const outRoot = join(import.meta.dir, ".out", "flame");
const args = process.argv.slice(2);
const valueAfter = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
const runs = Number(valueAfter("--runs") ?? 7);
const json = args.includes("--json");
const diffAt = args.indexOf("--diff");
const output = resolve(valueAfter("--out") ?? outRoot);
const requestedCallTimeoutMs = Number(process.env.FLAME_CALL_TIMEOUT_MS ?? "60000");
const callTimeoutMs = Number.isFinite(requestedCallTimeoutMs) && requestedCallTimeoutMs > 0 ? requestedCallTimeoutMs : 60000;

function usage(): never {
  throw new Error("usage: bun bench/flame.ts [--runs N] [--out DIR] <cloudtermDir> <workload> | --diff <dirA> <dirB> <workload> [--runs N] [--json]");
}

function shellBinary() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const version = readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell")).sort().pop();
  if (!version) throw new Error("Playwright chrome-headless-shell is unavailable");
  const folder = join(cache, version);
  const binary = readdirSync(folder).find((name) => name.startsWith("chrome-headless-shell"));
  if (!binary) throw new Error("Playwright chrome-headless-shell is unavailable");
  return join(folder, binary, "chrome-headless-shell");
}

function scratchFor(source: string) {
  const digest = createHash("sha256").update(resolve(source)).digest("hex").slice(0, 12);
  return join(outRoot, `${basename(source)}-${digest}`);
}

function build(source: string) {
  const scratch = scratchFor(source);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  cpSync(join(source, "src"), join(scratch, "src"), { recursive: true });
  cpSync(join(source, "package.json"), join(scratch, "package.json"));
  const dependencyDirectory = [join(source, "node_modules"), "/Users/jcoeyman/cloudflare/cloudterm/node_modules"].find(existsSync);
  if (!dependencyDirectory) throw new Error(`node_modules is unavailable for ${source}`);
  symlinkSync(dependencyDirectory, join(scratch, "node_modules"), "dir");
  const outfile = join(scratch, "dist", "index.js");
  mkdirSync(join(scratch, "dist"), { recursive: true });
  const result = Bun.spawnSync([join(root, "node_modules", ".bin", "esbuild"), "src/index.ts", "--bundle", "--format=esm", "--target=es2022", "--sourcemap", `--outfile=${outfile}`], { cwd: scratch, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`build failed for ${source}: ${new TextDecoder().decode(result.stderr)}`);
  if (!existsSync(outfile)) throw new Error(`build produced no output for ${source}`);
  return scratch;
}

function page(workload: string) {
  return `<!doctype html><style>html,body{margin:0;background:#000}#host{width:${cols * 9}px;height:${rows * 18}px}</style><div id="host"></div><script type="module">import { mount } from '/dist/index.js'; const input=${JSON.stringify(workload)}; const marker=input.match(/END-[A-Z]+/)?.[0]; const host=document.getElementById('host'); const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined))); const text=()=>[...host.querySelectorAll('.cloudterm-line')].map(line=>line.textContent).join('\\n'); window.run=async()=>{host.innerHTML='';const term=await mount(host,{onData:()=>{},predictionMode:'off'});await nextFrame();const pending=[];for(let i=0;i<input.length;i+=16384)pending.push(term.write(input.slice(i,i+16384)));await Promise.all(pending);const deadline=performance.now()+30000;while(performance.now()<deadline){await nextFrame();if(text().includes(marker)){await nextFrame();await nextFrame();term.destroy();return;}}throw new Error('workload did not settle; tail: '+JSON.stringify(text().slice(-160)));};window.ready=true;</script>`;
}

function serve(scratch: string, workload: string) {
  return Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/") return new Response(page(workload), { headers: { "content-type": "text/html" } });
    const file = resolve(scratch, `.${path}`);
    if (!file.startsWith(scratch) || !existsSync(file)) return new Response("not found", { status: 404 });
    return new Response(Bun.file(file));
  } });
}

async function waitForChromeExit(chrome: ReturnType<typeof spawn>) {
  if (!chrome.pid || chrome.exitCode !== null || chrome.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      chrome.removeListener("exit", done);
      chrome.removeListener("error", done);
      resolve();
    };
    chrome.once("exit", done);
    chrome.once("error", done);
    try {
      chrome.kill("SIGKILL");
    } catch {
      done();
    }
    if (chrome.exitCode !== null || chrome.signalCode !== null) done();
  });
}

async function profile(scratch: string, workload: string, destination: string): Promise<Run> {
  const server = serve(scratch, workloads[workload]!.input);
  const port = freePort();
  const chrome = spawn(process.env.FLAME_CHROME ?? shellBinary(), [`--remote-debugging-port=${port}`, "--use-angle=metal", "--enable-gpu", "--js-flags=--expose-gc", "about:blank"], { stdio: "ignore" });
  let chromeFailure: Error | undefined;
  chrome.on("error", (error) => { chromeFailure = error; });
  let socket: WebSocket | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const startTimeout = (callback: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, callTimeoutMs);
    timers.add(timer);
    return timer;
  };
  const stopTimeout = (timer: ReturnType<typeof setTimeout>) => {
    clearTimeout(timer);
    timers.delete(timer);
  };
  try {
    let ws = "";
    for (let attempt = 0; attempt < 100 && !ws; attempt++) {
      if (chromeFailure) throw chromeFailure;
      try { ws = ((await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as any[]).find((tab) => tab.type === "page")?.webSocketDebuggerUrl ?? ""; } catch {}
      if (!ws) await Bun.sleep(50);
    }
    if (chromeFailure) throw chromeFailure;
    if (!ws) throw new Error("Chrome DevTools endpoint did not start");
    socket = new WebSocket(ws);
    await new Promise<void>((resolve, reject) => {
      const timeout = startTimeout(() => reject(new Error(`CDP socket open timed out after ${callTimeoutMs} ms`)));
      socket!.addEventListener("open", () => { stopTimeout(timeout); resolve(); }, { once: true });
      socket!.addEventListener("error", () => { stopTimeout(timeout); reject(new Error("CDP socket failed to open")); }, { once: true });
      socket!.addEventListener("close", () => { stopTimeout(timeout); reject(new Error("CDP socket closed before opening")); }, { once: true });
    });
    let id = 0;
    const pending = new Map<number, { method: string; resolve: (message: any) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
    let socketFailure: "closed" | "error" | undefined;
    const rejectPending = (reason: "closed" | "error") => {
      socketFailure = reason;
      for (const [requestId, request] of pending) {
        stopTimeout(request.timeout);
        pending.delete(requestId);
        request.reject(new Error(`CDP ${request.method} socket ${reason}`));
      }
    };
    const errors: string[] = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const request = pending.get(message.id);
        if (request) {
          stopTimeout(request.timeout);
          pending.delete(message.id);
          request.resolve(message);
        }
      }
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map((arg: any) => arg.value ?? arg.description ?? "").join(" "));
      if (message.method === "Log.entryAdded") errors.push(message.params.entry.text);
    });
    socket.addEventListener("close", () => rejectPending("closed"));
    socket.addEventListener("error", () => rejectPending("error"));
    const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
      const requestId = ++id;
      const timeout = startTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`CDP ${method} timed out after ${callTimeoutMs} ms`));
      });
      pending.set(requestId, { method, resolve, reject, timeout });
      if (socketFailure) {
        stopTimeout(timeout);
        pending.delete(requestId);
        reject(new Error(`CDP ${method} socket ${socketFailure}`));
        return;
      }
      try {
        socket!.send(JSON.stringify({ id: requestId, method, params }));
      } catch (error) {
        stopTimeout(timeout);
        pending.delete(requestId);
        reject(new Error(`CDP ${method} socket ${socketFailure ?? "error"}: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/` });
    for (let attempt = 0; attempt < 200; attempt++) {
      const ready = await send("Runtime.evaluate", { expression: "window.ready === true", returnByValue: true });
      if (ready.result?.result?.value) break;
      await Bun.sleep(50);
    }
    const evaluate = async (expression: string) => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true });
      if (result.error || result.result?.exceptionDetails) throw new Error(`profile evaluation failed: ${JSON.stringify(result.error ?? result.result.exceptionDetails)}\n${errors.join("\n")}`);
      return result;
    };
    await evaluate("run()");
    await evaluate("globalThis.gc?.()");
    await send("Profiler.enable");
    await send("Profiler.setSamplingInterval", { interval: 50 });
    await send("Profiler.start");
    await evaluate(`(async () => { for (let iteration = 0; iteration < ${profileIterations}; iteration++) { await run(); globalThis.gc?.(); } })()`);
    const stopped = await send("Profiler.stop");
    if (stopped.error || !stopped.result?.profile) throw new Error(`profile stop failed: ${JSON.stringify(stopped.error ?? stopped)}`);
    if (errors.length) throw new Error(`profile reported errors: ${errors.join("\n")}`);
    const raw = stopped.result.profile as Profile;
    mkdirSync(destination, { recursive: true });
      const path = join(destination, `capture-${Date.now()}-${Math.random().toString(16).slice(2)}.cpuprofile`);
    writeFileSync(path, JSON.stringify(raw));
    socket.close();
    return { entries: mapProfile(raw, scratch).map((entry) => ({ ...entry, self: entry.self / profileIterations, total: entry.total / profileIterations })), profile: raw, path };
  } finally {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    try {
      socket?.close();
    } catch {}
    server.stop(true);
    await waitForChromeExit(chrome);
  }
}

function mapProfile(profile: Profile, scratch: string): Entry[] {
  const map = JSON.parse(readFileSync(join(scratch, "dist", "index.js.map"), "utf8"));
  const consumer = new SourceMapConsumer(map as any);
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const totals = new Map<number, { self: number; total: number }>();
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
    const sample = profile.samples![i];
    const milliseconds = (profile.timeDeltas?.[i] ?? 0) / 1000;
    totals.set(sample, { self: (totals.get(sample)?.self ?? 0) + milliseconds, total: totals.get(sample)?.total ?? 0 });
    for (let current = parent.get(sample); current; current = parent.get(current)) totals.set(current, { self: totals.get(current)?.self ?? 0, total: (totals.get(current)?.total ?? 0) + milliseconds });
  }
  const entries = new Map<string, Entry>();
  for (const [id, timing] of totals) {
    const frame = nodes.get(id)?.callFrame;
    if (!frame || frame.functionName === "(idle)") continue;
    const original = frame.url.endsWith("/dist/index.js") ? consumer.originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber }) : null;
    const mapped = original?.source ? relative(scratch, resolve(join(scratch, "dist"), original.source)) : "";
    const source = mapped.startsWith("../") ? mapped.slice(3) : mapped || frame.url || "native";
    const line = original?.line ?? frame.lineNumber + 1;
    const fn = original?.name || frame.functionName || "(anonymous)";
    const key = `${fn} ${source}:${line}`;
    const entry = entries.get(key) ?? { key, fn, source: `${source}:${line}`, self: 0, total: 0 };
    entry.self += timing.self;
    entry.total += timing.total;
    entries.set(key, entry);
  }
  consumer.destroy?.();
  return [...entries.values()];
}

function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }
function medianAbsoluteDeviation(values: number[]) { const center = median(values); return median(values.map((value) => Math.abs(value - center))); }
function spread(values: number[]) { return { min: Math.min(...values), max: Math.max(...values) }; }
function report(entries: Entry[]) {
  const top = [...entries].sort((a, b) => b.total - a.total).slice(0, 30);
  console.log("call tree (total self fn source):");
  for (const entry of top.filter((entry) => entry.total >= 0.3)) console.log(`${entry.total.toFixed(2)} ${entry.self.toFixed(2)} ${entry.fn} ${entry.source}`);
  console.log("top self:");
  for (const entry of [...entries].sort((a, b) => b.self - a.self).slice(0, 30)) console.log(`${entry.self.toFixed(2)} ${entry.fn} ${entry.source}`);
}

async function single(source: string, workload: string) {
  const scratch = build(source);
  const label = basename(source);
  for (let index = 0; index < runs; index++) {
    const run = await profile(scratch, workload, output);
    const path = join(output, `${label}-run${index + 1}.cpuprofile`);
    writeFileSync(path, readFileSync(run.path));
    rmSync(run.path);
    report(run.entries);
    console.log(`saved ${path}`);
  }
}

async function compare(a: string, b: string, workload: string) {
  const builds = [build(a), build(b)];
  const collected: Entry[][][] = [[], []];
  for (let index = 0; index < runs; index++) for (const side of [0, 1]) collected[side].push((await profile(builds[side], workload, output)).entries);
  const canonicalKey = (entry: Entry) => `${entry.fn} ${entry.source.replace(/:\d+$/, "")}`;
  const merge = (entries: Entry[]) => [...entries.reduce((merged, entry) => {
    const key = canonicalKey(entry);
    const prior = merged.get(key) ?? { ...entry, key, self: 0, total: 0 };
    prior.self += entry.self;
    prior.total += entry.total;
    merged.set(key, prior);
    return merged;
  }, new Map<string, Entry>()).values()];
  const normalized = collected.map((side) => side.map(merge));
  const keys = new Set(normalized.flat(2).map((entry) => entry.key));
  const rows = [...keys].map((key) => {
    const samples = normalized.map((side) => side.map((run) => run.find((entry) => entry.key === key) ?? { key, fn: key.split(" ")[0], source: key.slice(key.indexOf(" ") + 1), self: 0, total: 0 }));
    const self = samples.map((side) => side.map((entry) => entry.self));
    const total = samples.map((side) => side.map((entry) => entry.total));
    const delta = median(self[1]) - median(self[0]);
    const ranges = self.map(spread);
    const threshold = 0.5 + 3 * Math.max(...self.map(medianAbsoluteDeviation));
    const representative = samples.flat().find((entry) => entry.source !== key.slice(key.indexOf(" ") + 1)) ?? samples[0][0];
    return { key, fn: representative.fn, source: representative.source, a: { self: median(self[0]), total: median(total[0]), spread: ranges[0] }, b: { self: median(self[1]), total: median(total[1]), spread: ranges[1] }, delta, threshold, significant: Math.abs(delta) > threshold };
  }).sort((left, right) => right.delta - left.delta);
  if (json) console.log(JSON.stringify(rows)); else for (const row of rows) console.log(`${row.significant ? "significant " : ""}${row.delta.toFixed(2)}ms threshold ${row.threshold.toFixed(2)} ${row.fn} ${row.source} A ${row.a.self.toFixed(2)} B ${row.b.self.toFixed(2)} spread ${row.a.spread.min.toFixed(2)}..${row.a.spread.max.toFixed(2)} ${row.b.spread.min.toFixed(2)}..${row.b.spread.max.toFixed(2)}`);
}

if (diffAt >= 0) {
  const [a, b, workload] = args.slice(diffAt + 1).filter((value, index, all) => value !== "--runs" && value !== valueAfter("--runs") && value !== "--json" && value !== "--out" && value !== valueAfter("--out"));
  if (!a || !b || !workload || !workloads[workload]) usage();
  await compare(a, b, workload);
} else {
  const positional = args.filter((value, index, all) => !["--runs", "--out", "--json"].includes(value) && value !== valueAfter("--runs") && value !== valueAfter("--out"));
  if (positional.length !== 2 || !workloads[positional[1]]) usage();
  await single(positional[0], positional[1]);
}
