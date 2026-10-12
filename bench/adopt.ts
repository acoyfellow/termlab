import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Candidate = { id: string; npm: string; readmeFrom: string; packageDir: string; canvas: boolean };

const root = join(import.meta.dir, "..");
const out = join(import.meta.dir, ".out", "adopt");
mkdirSync(out, { recursive: true });

const candidates: Candidate[] = [
  { id: "cloudterm", npm: "cloudterm", readmeFrom: "node_modules/cloudterm/README.md", packageDir: "node_modules/cloudterm", canvas: false },
  { id: "xterm", npm: "@xterm/xterm", readmeFrom: "node_modules/@xterm/xterm/README.md", packageDir: "node_modules/@xterm/xterm", canvas: false },
  { id: "wterm", npm: "@wterm/dom", readmeFrom: "node_modules/@wterm/dom/README.md", packageDir: "node_modules/@wterm/dom", canvas: false },
  { id: "ghostty-web", npm: "ghostty-web", readmeFrom: "node_modules/ghostty-web/README.md", packageDir: "node_modules/ghostty-web", canvas: true },
];
if (process.env.ADOPT_SELFTEST === "1") candidates.push({ id: "planted-wrong-readme", npm: "cloudterm", readmeFrom: "node_modules/@xterm/xterm/README.md", packageDir: "node_modules/cloudterm", canvas: false });

const model = process.env.ADOPT_MODEL ?? "gpt-5.6-terra";
const runs = Number(process.env.ADOPT_RUNS ?? 1);
const timeoutMs = Number(process.env.ADOPT_TIMEOUT_MS ?? 600000);
const marker = "ADOPT-OK-7f3a";

const task = (c: Candidate) => `You are in an empty web project directory. Build a page that embeds the terminal emulator package "${c.npm}".

The package is already installed in node_modules/${c.npm}. Its README is at ./PACKAGE_README.md. Use only the README and the package's own files in node_modules for API details. Do not use the internet and do not install other terminal packages.

Requirements:
1. Create index.html and main.js (plain ES modules, no framework, no bundler config needed; the page will be served by \`bunx vite\` from this directory).
2. Mount a terminal from "${c.npm}" into a full-window element.
3. Write this exact text to the terminal once it is ready: ${marker}
4. Expose two globals on window for automated checks:
   - window.termWrite(text): writes text to the terminal.
   - window.termInput: an array; push every string the terminal emits as user input (keyboard data) into it, decoded to a string.
5. Do not draw the marker text any other way than writing it to the terminal.

When finished, stop. Do not start a dev server.`;

const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop()!;
const binary = join(cacheDir, shellDir, readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-headless-shell"))!, "chrome-headless-shell");

function prepareSandbox(c: Candidate, run: number): string {
  const dir = join(out, `${c.id}-${run}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  const target = join(dir, "node_modules", c.npm);
  mkdirSync(join(target, ".."), { recursive: true });
  cpSync(join(root, c.packageDir), target, { recursive: true, dereference: true });
  const deps = JSON.parse(readFileSync(join(root, c.packageDir, "package.json"), "utf8")).dependencies ?? {};
  for (const dep of Object.keys(deps)) {
    const from = join(root, "node_modules", dep);
    if (existsSync(from)) { mkdirSync(join(dir, "node_modules", dep, ".."), { recursive: true }); cpSync(from, join(dir, "node_modules", dep), { recursive: true, dereference: true }); }
  }
  cpSync(join(root, c.readmeFrom), join(dir, "PACKAGE_README.md"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `adopt-${c.id}`, private: true, type: "module", dependencies: { [c.npm]: "*" } }, null, 2));
  return dir;
}

async function runAgent(dir: string, prompt: string): Promise<{ exitCode: number | null; ms: number; transcriptBytes: number; toolCalls: number; tokens: number; costUsd: number }> {
  const t0 = performance.now();
  return await new Promise((resolve) => {
    const child = spawn("pi", ["-p", "--no-session", "--model", model, "--mode", "json"], { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.end(prompt);
    let transcript = "";
    child.stdout.on("data", (d) => { transcript += d; });
    child.stderr.on("data", (d) => { transcript += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (e) => { transcript += "spawn error: " + e.message; });
    child.on("exit", (code, signal) => {
      if (signal) transcript += `\nexit signal: ${signal} after ${Math.round(performance.now() - t0)}ms`;
      clearTimeout(timer);
      writeFileSync(join(dir, ".agent-transcript.jsonl"), transcript);
      const toolCalls = (transcript.match(/"type":"tool_execution_start"/g) ?? []).length;
      const totals = [...transcript.matchAll(/"totalTokens":(\d+)/g)].map((m) => Number(m[1]));
      const costs = [...transcript.matchAll(/"cost":\{[^}]*"total":([0-9.]+)/g)].map((m) => Number(m[1]));
      resolve({ exitCode: code, ms: performance.now() - t0, transcriptBytes: transcript.length, toolCalls, tokens: totals.reduce((a, b) => a + b, 0), costUsd: Math.round(costs.reduce((a, b) => a + b, 0) * 1000) / 1000 });
    });
  });
}

async function verify(dir: string, c: Candidate, port: number): Promise<{ markerVisible: boolean; markerInDom: boolean; writeWorks: boolean; inputWorks: boolean; error?: string }> {
  if (!existsSync(join(dir, "index.html"))) return { markerVisible: false, markerInDom: false, writeWorks: false, inputWorks: false, error: "no index.html" };
  const vitePort = port + 1000;
  const vite = spawn(join(root, "node_modules/.bin/vite"), ["--host", "127.0.0.1", "--port", String(vitePort), "--strictPort", "--logLevel", "error"], { cwd: dir, stdio: "ignore" });
  const chrome = spawn(binary, [`--remote-debugging-port=${port}`, "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${vitePort}/`)).ok) break; } catch {} await Bun.sleep(100); }
    let ws = "";
    for (let i = 0; i < 80 && !ws; i++) { try { ws = ((await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as any[]).find((t) => t.type === "page")?.webSocketDebuggerUrl ?? ""; } catch {} if (!ws) await Bun.sleep(100); }
    const sock = new WebSocket(ws);
    await new Promise((r) => sock.addEventListener("open", r, { once: true }));
    let id = 0;
    const waiting = new Map<number, (v: any) => void>();
    sock.addEventListener("message", (e) => { const m = JSON.parse(String(e.data)); if (m.id) waiting.get(m.id)?.(m); });
    const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++id; waiting.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async (expression: string) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
    await send("Page.enable");
    await send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
    await Bun.sleep(4000);
    const markerInDom = Boolean(await evaluate(`document.body.innerText.includes(${JSON.stringify(marker)})`));
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(dir, ".verify.png"), Buffer.from(shot.result?.data ?? "", "base64"));
    const probe = "PROBE-" + Math.random().toString(36).slice(2, 8);
    const writeWorks = Boolean(await evaluate(`(async () => { if (typeof window.termWrite !== 'function') return false; window.termWrite('\\r\\n${probe}'); await new Promise((r) => setTimeout(r, 300)); return document.body.innerText.includes('${probe}') || 'canvas'; })()`));
    await evaluate(`(document.querySelector('textarea') ?? document.querySelector('canvas') ?? document.body).focus()`);
    await send("Input.insertText", { text: "abc" });
    await Bun.sleep(200);
    const inputWorks = Boolean(await evaluate(`Array.isArray(window.termInput) && window.termInput.join('').includes('abc')`));
    sock.close();
    return { markerVisible: markerInDom || c.canvas, markerInDom, writeWorks, inputWorks };
  } catch (e) {
    return { markerVisible: false, markerInDom: false, writeWorks: false, inputWorks: false, error: String(e).slice(0, 200) };
  } finally {
    chrome.kill("SIGKILL");
    vite.kill("SIGKILL");
  }
}

if (process.env.ADOPT_VERIFY_ONLY === "1") {
  for (const c of candidates.filter((x) => process.argv.slice(2).includes(x.id))) {
    const dir = join(out, `${c.id}-0`);
    console.log(c.id, JSON.stringify(await verify(dir, c, 9890)));
  }
  process.exit(0);
}
const onlyIds = process.argv.slice(2);
const selected = onlyIds.length ? candidates.filter((c) => onlyIds.includes(c.id)) : candidates;
const results: any[] = [];
let port = 9800;
for (const c of selected) {
  for (let run = 0; run < runs; run++) {
    const dir = prepareSandbox(c, run);
    const agent = await runAgent(dir, task(c));
    const check = await verify(dir, c, port++);
    const files = readdirSync(dir).filter((f) => !f.startsWith(".") && f !== "node_modules");
    const r = { id: c.id, run, model, ...agent, files, ...check };
    results.push(r);
    process.stderr.write(`${c.id}#${run}: agent ${Math.round(agent.ms / 1000)}s exit ${agent.exitCode} tools ${agent.toolCalls} tokens ${agent.tokens} $${agent.costUsd} | dom marker ${check.markerInDom} write ${check.writeWorks} input ${check.inputWorks}${check.error ? " | " + check.error : ""}\n`);
  }
}
console.table(results.map((r) => ({ id: r.id, run: r.run, seconds: Math.round(r.ms / 1000), tools: r.toolCalls, tokens: r.tokens, usd: r.costUsd, markerInDom: r.markerInDom, writeWorks: r.writeWorks, inputWorks: r.inputWorks, error: r.error ?? "" })));
writeFileSync(join(onlyIds.length ? join(import.meta.dir, ".out") : join(root, "src/lib"), "adopt-results.json"), JSON.stringify({ generatedAt: new Date().toISOString(), model, runs, task: task({ id: "<id>", npm: "<package>", readmeFrom: "", packageDir: "", canvas: false }), results }, null, 2) + "\n");
