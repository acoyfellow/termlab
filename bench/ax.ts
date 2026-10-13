import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { adapters, freePort, root, type Adapter } from "./adapters";

const out = join(import.meta.dir, ".out");
mkdirSync(out, { recursive: true });

const ESC = "\x1b";
const screenScript = [
  `${ESC}[1;32muser@box${ESC}[0m:${ESC}[1;34m~/proj${ESC}[0m$ ls -la`,
  `total 24`,
  `drwxr-xr-x  4 user staff  128 Oct 12 09:00 ${ESC}[1;34msrc${ESC}[0m`,
  `-rw-r--r--  1 user staff 2048 Oct 12 09:00 ${ESC}[38;5;208mpackage.json${ESC}[0m`,
  `-rwxr-xr-x  1 user staff  512 Oct 12 09:00 ${ESC}[38;2;0;200;120mbuild.sh${ESC}[0m`,
  `${ESC}[7m reverse ${ESC}[27m ${ESC}[4munderlined${ESC}[24m ${ESC}[3mitalic${ESC}[23m`,
  `wide: 日本語テキスト and emoji: ok`,
  `progress: [#####     ] 50%\r` + `progress: [##########] 100%`,
  `tab\tseparated\tcolumns`,
  `error: ${ESC}[31mcannot find module 'x'${ESC}[0m`,
  `AX-END-MARKER`,
];
const expectedLines = [
  "user@box:~/proj$ ls -la",
  "total 24",
  "drwxr-xr-x  4 user staff  128 Oct 12 09:00 src",
  "-rw-r--r--  1 user staff 2048 Oct 12 09:00 package.json",
  "-rwxr-xr-x  1 user staff  512 Oct 12 09:00 build.sh",
  " reverse  underlined italic",
  "wide: 日本語テキスト and emoji: ok",
  "progress: [##########] 100%",
  "tab     separated       columns",
  "error: cannot find module 'x'",
  "AX-END-MARKER",
];
const screenInput = Array.from({ length: 30 }, (_, i) => `scrollback line ${i}`).join("\r\n") + "\r\n" + screenScript.join("\r\n");

const inputCases: { name: string; send: { kind: "type" | "key" | "paste"; value: string; code?: string; keyCode?: number; modifiers?: number }[]; expected: string }[] = [
  { name: "ascii typing", send: [{ kind: "type", value: "ls -la" }], expected: "ls -la" },
  { name: "enter", send: [{ kind: "key", value: "Enter", code: "Enter", keyCode: 13 }], expected: "\r" },
  { name: "ctrl-c", send: [{ kind: "key", value: "c", code: "KeyC", keyCode: 67, modifiers: 2 }], expected: "\x03" },
  { name: "arrow up", send: [{ kind: "key", value: "ArrowUp", code: "ArrowUp", keyCode: 38 }], expected: "\x1b[A" },
  { name: "tab", send: [{ kind: "key", value: "Tab", code: "Tab", keyCode: 9 }], expected: "\t" },
  { name: "backspace", send: [{ kind: "key", value: "Backspace", code: "Backspace", keyCode: 8 }], expected: "\x7f" },
  { name: "unicode typing", send: [{ kind: "type", value: "héllo 日本" }], expected: "héllo 日本" },
  { name: "paste", send: [{ kind: "paste", value: "echo pasted" }], expected: "echo pasted" },
];

const approxTokens = (s: string) => Math.ceil(new TextEncoder().encode(s).length / 4);
const normalizeLine = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+$/u, "");

function lineFidelity(text: string): { matched: number; total: number; missing: string[] } {
  const lines = text.split(/\r?\n/).map(normalizeLine);
  const missing = expectedLines.filter((want) => !lines.some((got) => got === want || got.replace(/\s+/g, " ") === want.replace(/\s+/g, " ")));
  return { matched: expectedLines.length - missing.length, total: expectedLines.length, missing };
}

const html = (adapter: Adapter) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}#host{width:1080px;height:720px}</style></head>
<body><div id="host"></div><script type="module" src="./ax-${adapter.id}.ts"></script></body></html>`;

const script = (adapter: Adapter) => `import '@xterm/xterm/css/xterm.css';
const host = document.getElementById('host');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
function bufferText(t) { const b = t.buffer?.active; if (!b) return ''; let s = ''; for (let i = Math.max(0, b.length - 45); i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\\n'; return s; }
async function make(): Promise<any> { ${adapter.setup} }
let received = '';
(window as any).__axInput = (d) => { received += String(d); };
(window as any).axTakeInput = () => { const r = received; received = ''; return r; };
(window as any).axMount = async () => { (window as any).__ax = await make(); await nextFrame(); await nextFrame(); };
(window as any).axWrite = async (s, marker) => {
  const t = (window as any).__ax;
  const t0 = performance.now();
  await t.write(s);
  let domMs = null;
  let apiMs = null;
  const deadline = t0 + 10000;
  while (performance.now() < deadline && (domMs === null || apiMs === null)) {
    if (domMs === null && host.innerText.includes(marker)) domMs = performance.now() - t0;
    if (apiMs === null && String(t.text()).includes(marker)) apiMs = performance.now() - t0;
    if (domMs === null || apiMs === null) await new Promise((r) => setTimeout(r, 1));
  }
  await nextFrame(); await nextFrame();
  return { domMs, apiMs };
};
(window as any).axReads = () => ({ innerText: host.innerText, innerTextSample: JSON.stringify(host.innerText.slice(0, 300)), api: String((window as any).__ax.text()), canvas: host.querySelectorAll('canvas').length, nodes: host.querySelectorAll('*').length, html: host.innerHTML.length });
(window as any).axFocusTarget = () => {
  const candidates = [...host.querySelectorAll('textarea, input, [contenteditable=""], [contenteditable="true"], [tabindex]')];
  const el = candidates.find((e) => e.tagName === 'TEXTAREA') ?? candidates[0] ?? host.querySelector('canvas') ?? host;
  const iframe = host.querySelector('iframe');
  if (iframe && !candidates.length) { iframe.focus(); return 'iframe'; }
  (el as HTMLElement).focus();
  const r = (el as HTMLElement).getBoundingClientRect();
  return el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') + '@' + Math.round(r.x + Math.min(r.width, 20) / 2) + ',' + Math.round(r.y + Math.min(r.height, 20) / 2);
};
(window as any).axPaste = (text) => {
  const target = document.activeElement ?? host;
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
};
(window as any).ready = true;
`;

const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop()!;
const binary = join(cacheDir, shellDir, readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-headless-shell"))!, "chrome-headless-shell");

const plantedDefects = process.env.AX_SELFTEST === "1";
if (plantedDefects) {
  const broken = adapters.find((a) => a.id === "cloudterm")!;
  adapters.push({ ...broken, id: "planted-no-input", setup: broken.setup.replace("onData: (d) => (window as any).__axInput?.(new TextDecoder().decode(d))", "onData() {}") });
  adapters.push({ ...broken, id: "planted-hidden-text", setup: broken.setup.replace("return {", "host.style.color = 'transparent'; for (const l of host.querySelectorAll('.cloudterm-line')) l.setAttribute('aria-hidden', 'true'); const hide = new MutationObserver(() => { for (const l of host.querySelectorAll('.cloudterm-line')) { l.setAttribute('aria-hidden', 'true'); l.style.display = 'none'; } }); hide.observe(host, { childList: true, subtree: true }); return {") });
}
for (const adapter of adapters) { writeFileSync(join(out, `ax-${adapter.id}.html`), html(adapter)); writeFileSync(join(out, `ax-${adapter.id}.ts`), script(adapter)); }
const routes: Record<string, unknown> = {};
for (const adapter of adapters) routes[`/${adapter.id}`] = (await import(join(out, `ax-${adapter.id}.html`))).default;
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", development: false, routes: routes as any });

type Cdp = { send: (method: string, params?: object) => Promise<any>; close: () => void; errors: string[] };

async function openPage(port: number, path: string): Promise<{ cdp: Cdp; chrome: ReturnType<typeof spawn> }> {
  const chrome = spawn(binary, [`--remote-debugging-port=${port}`, "--window-size=1200,900", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu", "about:blank"], { stdio: "ignore" });
  let ws = "";
  for (let i = 0; i < 80 && !ws; i++) { try { ws = ((await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as any[]).find((t) => t.type === "page")?.webSocketDebuggerUrl ?? ""; } catch {} if (!ws) await Bun.sleep(100); }
  const sock = new WebSocket(ws);
  await new Promise((r) => sock.addEventListener("open", r, { once: true }));
  let id = 0;
  const waiting = new Map<number, (v: any) => void>();
  const errors: string[] = [];
  sock.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id) waiting.get(m.id)?.(m);
    if (m.method === "Runtime.exceptionThrown") errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 200));
  });
  const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++id; waiting.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Accessibility.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${server.port}${path}` });
  for (let i = 0; i < 200; i++) { const r = await send("Runtime.evaluate", { expression: "window.ready === true", returnByValue: true }); if (r.result?.result?.value) break; await Bun.sleep(100); }
  return { cdp: { send, close: () => sock.close(), errors }, chrome };
}

const evaluate = async (cdp: Cdp, expression: string) => (await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 30000 })).result?.result?.value;

async function accessibilityText(cdp: Cdp): Promise<string> {
  const { result } = await cdp.send("Accessibility.getFullAXTree");
  const nodes: any[] = result?.nodes ?? [];
  const lines: string[] = [];
  const byParent = new Map<string, string[]>();
  const order: string[] = [];
  for (const node of nodes) {
    if (node.ignored || node.role?.value !== "StaticText" || typeof node.name?.value !== "string") continue;
    const parent = String(node.parentId ?? node.nodeId);
    if (!byParent.has(parent)) { byParent.set(parent, []); order.push(parent); }
    byParent.get(parent)!.push(node.name.value);
  }
  for (const parent of order) lines.push(byParent.get(parent)!.join(""));
  return lines.join("\n");
}

async function sendInput(cdp: Cdp, step: (typeof inputCases)[number]["send"][number]) {
  if (step.kind === "type") { await cdp.send("Input.insertText", { text: step.value }); return; }
  if (step.kind === "paste") { await evaluate(cdp, `axPaste(${JSON.stringify(step.value)})`); return; }
  const base = { key: step.value, code: step.code, windowsVirtualKeyCode: step.keyCode, nativeVirtualKeyCode: step.keyCode, modifiers: step.modifiers ?? 0 };
  const text = step.value === "Enter" ? "\r" : step.value === "Tab" ? "\t" : step.modifiers ? undefined : step.value.length === 1 ? step.value : undefined;
  await cdp.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text, unmodifiedText: text } : {}) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

async function measure(adapter: Adapter, port: number) {
  const { cdp, chrome } = await openPage(port, `/${adapter.id}`);
  try {
    await evaluate(cdp, "axMount()");
    const timing = await evaluate(cdp, `axWrite(${JSON.stringify(screenInput)}, 'AX-END-MARKER')`);
    const reads = await evaluate(cdp, "axReads()");
    const ax = await accessibilityText(cdp);
    const read = (text: string) => ({ ...lineFidelity(text), tokens: approxTokens(text), chars: text.length });
    const focus = await evaluate(cdp, "axFocusTarget()");
    await evaluate(cdp, "axTakeInput()");
    const input: { name: string; ok: boolean; got: string }[] = [];
    for (const c of inputCases) {
      for (const step of c.send) await sendInput(cdp, step);
      await Bun.sleep(60);
      const got: string = (await evaluate(cdp, "axTakeInput()")) ?? "";
      input.push({ name: c.name, ok: got === c.expected, got: JSON.stringify(got).slice(0, 40) });
    }
    return {
      id: adapter.id,
      version: adapter.version,
      canvas: reads.canvas > 0,
      domNodes: reads.nodes,
      htmlChars: reads.html,
      innerTextSample: reads.innerTextSample,
      readableDomMs: timing.domMs === null ? null : Math.round(timing.domMs * 10) / 10,
      readableApiMs: timing.apiMs === null ? null : Math.round(timing.apiMs * 10) / 10,
      reads: { innerText: read(reads.innerText), accessibility: read(ax), api: read(reads.api) },
      focusTarget: focus,
      input: { passed: input.filter((r) => r.ok).length, total: input.length, cases: input },
      errors: cdp.errors.slice(0, 3),
    };
  } finally {
    cdp.close();
    chrome.kill("SIGKILL");
  }
}

const onlyIds = process.argv.slice(2);
const selected = onlyIds.length ? adapters.filter((a) => onlyIds.includes(a.id)) : adapters;
if (plantedDefects) process.stderr.write(`selected: ${selected.map((a) => a.id).join(",")}\n`);
const results = [];
for (const adapter of selected) {
  try { results.push(await measure(adapter, freePort())); }
  catch (e) { results.push({ id: adapter.id, version: adapter.version, error: String(e).slice(0, 200) }); }
  const r: any = results.at(-1);
  process.stderr.write(`${adapter.id}: ${r.error ?? `dom ${r.reads.innerText.matched}/${r.reads.innerText.total} ax ${r.reads.accessibility.matched}/${r.reads.accessibility.total} input ${r.input.passed}/${r.input.total}`}\n`);
}
server.stop(true);

if (plantedDefects) {
  const byId = Object.fromEntries(results.map((r: any) => [r.id, r]));
  const checks = [
    ["planted-no-input must fail input", byId["planted-no-input"]?.input?.passed === 0],
    ["planted-hidden-text must fail a11y and innerText", byId["planted-hidden-text"]?.reads?.accessibility?.matched < 11 && byId["planted-hidden-text"]?.reads?.innerText?.matched < 11],
    ["cloudterm control must pass input", byId["cloudterm"]?.input?.passed === 8],
  ] as const;
  for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} selftest: ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exit(1);
}

console.table(results.map((r: any) => r.error ? { id: r.id, error: r.error } : {
  id: r.id,
  "innerText lines": `${r.reads.innerText.matched}/${r.reads.innerText.total}`,
  "innerText tok": r.reads.innerText.tokens,
  "a11y lines": `${r.reads.accessibility.matched}/${r.reads.accessibility.total}`,
  "a11y tok": r.reads.accessibility.tokens,
  "api lines": `${r.reads.api.matched}/${r.reads.api.total}`,
  "readable ms": r.readableDomMs ?? "never",
  input: `${r.input.passed}/${r.input.total}`,
  focus: String(r.focusTarget).slice(0, 28),
}));
const published = { generatedAt: new Date().toISOString(), screen: { input: screenScript, expectedLines }, inputCases: inputCases.map((c) => ({ name: c.name, expected: JSON.stringify(c.expected) })), terminals: results };
writeFileSync(join(onlyIds.length ? out : join(root, "src/lib"), "ax-results.json"), JSON.stringify(published, null, 2) + "\n");
