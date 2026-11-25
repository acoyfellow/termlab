import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { adapters, freePort, root, type Adapter } from "./adapters";

const out = join(import.meta.dir, ".out");
mkdirSync(out, { recursive: true });

export type ConformanceCase = {
  id: string;
  category: string;
  name: string;
  needsScreen: boolean;
};

export const conformanceCases: ConformanceCase[] = [
  { id: "cup-overwrite", category: "Cursor & editing", name: "CSI H cursor positioning & overwrite", needsScreen: true },
  { id: "erase-line-display", category: "Cursor & editing", name: "CSI K / CSI 2J erase line & display", needsScreen: true },
  { id: "ich-dch", category: "Cursor & editing", name: "CSI @ / CSI P insert & delete chars", needsScreen: true },
  { id: "il-dl", category: "Cursor & editing", name: "CSI L / CSI M insert & delete lines", needsScreen: true },
  { id: "scroll-region", category: "Cursor & editing", name: "CSI r DECSTBM scroll region", needsScreen: true },
  { id: "pending-wrap", category: "Cursor & editing", name: "VT100 pending-wrap (xenl) at col 120", needsScreen: true },
  { id: "alt-screen-1049", category: "Buffers & modes", name: "CSI ?1049h/l alt screen save & restore", needsScreen: true },
  { id: "decsc-decrc", category: "Buffers & modes", name: "ESC 7 / ESC 8 save & restore cursor", needsScreen: true },
  { id: "sync-output-2026", category: "Buffers & modes", name: "CSI ?2026h/l synchronized output", needsScreen: true },
  { id: "dec-line-drawing", category: "Buffers & modes", name: "ESC ( 0 DEC Special Graphics charset", needsScreen: true },
  { id: "cjk-wide", category: "Unicode", name: "Wide CJK 2-column cursor advance", needsScreen: true },
  { id: "combining-marks", category: "Unicode", name: "Combining mark zero-width advance", needsScreen: true },
  { id: "emoji-utf8", category: "Unicode", name: "UTF-8 accents and emoji fidelity", needsScreen: true },
  { id: "dsr-cpr-6n", category: "Queries & replies", name: "CSI 6n cursor position report", needsScreen: false },
  { id: "da1-primary", category: "Queries & replies", name: "CSI c primary device attributes (DA1)", needsScreen: false },
  { id: "dsr-status-5n", category: "Queries & replies", name: "CSI 5n device status report", needsScreen: false },
  { id: "resize-reflow", category: "Resize & tabs", name: "Line reflow across shrink and widen", needsScreen: true },
  { id: "tab-stops", category: "Resize & tabs", name: "Default 8-col tabs + TBC/HTS custom stop", needsScreen: true },
];

const html = (adapter: Adapter) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}#host{width:1080px;height:720px}</style></head>
<body><div id="host"></div><script type="module" src="./conf-${adapter.id}.ts"></script></body></html>`;

const script = (adapter: Adapter) => `import '@xterm/xterm/css/xterm.css';
const host = document.getElementById('host');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
function bufferText(t) { const b = t.buffer?.active; if (!b) return ''; let s = ''; for (let i = Math.max(0, b.length - 45); i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\\n'; return s; }
function bufferScreen(t) { const b = t.buffer?.active; if (!b) return []; const out = []; for (let i = 0; i < t.rows; i++) out.push(b.getLine(b.baseY + i)?.translateToString(true) ?? ''); return out; }
let replyBuf = '';
(window as any).__axInput = (d) => { replyBuf += String(d); };
async function make(): Promise<any> { ${adapter.setup} }
async function settleFrames() { await nextFrame(); await nextFrame(); await new Promise((r) => setTimeout(r, 25)); }

async function runOne(fn) {
  host.innerHTML = '';
  host.style.width = '1080px';
  host.style.height = '720px';
  replyBuf = '';
  const t = await make();
  await settleFrames();
  try {
    return await fn(t);
  } catch (e) {
    return { pass: false, detail: 'threw: ' + String(e).slice(0, 140) };
  } finally {
    try { t.destroy(); } catch {}
  }
}

const tests = {
  'cup-overwrite': async (t) => {
    await t.write('\\x1b[2;5HHELLO\\x1b[2;5HWO');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows[1] ?? '';
    return { pass: got === '    WOLLO', detail: JSON.stringify(got) };
  },
  'erase-line-display': async (t) => {
    await t.write('1234567890\\r\\nsecond\\x1b[1;5H\\x1b[K');
    await settleFrames();
    const a = t.screen();
    if (!a) return { pass: null, detail: 'no screen API' };
    const ok1 = (a[0] ?? '') === '1234' && (a[1] ?? '') === 'second';
    await t.write('\\x1b[2J\\x1b[HAFTER');
    await settleFrames();
    const b = t.screen();
    const ok2 = (b[0] ?? '') === 'AFTER' && (b[1] ?? '') === '';
    return { pass: ok1 && ok2, detail: JSON.stringify([a[0], a[1], b[0], b[1]]) };
  },
  'ich-dch': async (t) => {
    await t.write('ABCDEF\\x1b[1;3H\\x1b[2@XY\\x1b[1;1H\\x1b[1P');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows[0] ?? '';
    return { pass: got === 'BXYCDEF', detail: JSON.stringify(got) };
  },
  'il-dl': async (t) => {
    await t.write('R1\\r\\nR2\\r\\nR3\\r\\nR4\\x1b[2;1H\\x1b[1LINS\\x1b[4;1H\\x1b[1M');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows.slice(0, 4);
    const pass = got[0] === 'R1' && got[1] === 'INS' && got[2] === 'R2' && got[3] === 'R4';
    return { pass, detail: JSON.stringify(got) };
  },
  'scroll-region': async (t) => {
    await t.write('HDR\\r\\nA\\r\\nB\\r\\nC\\r\\nFTR\\x1b[2;4r\\x1b[4;1H\\r\\nD\\x1b[r');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows.slice(0, 5);
    const pass = got[0] === 'HDR' && got[1] === 'B' && got[2] === 'C' && got[3] === 'D' && got[4] === 'FTR';
    return { pass, detail: JSON.stringify(got) };
  },
  'pending-wrap': async (t) => {
    const cols = t.size().cols;
    await t.write('A'.repeat(cols) + '\\rX');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const want = 'X' + 'A'.repeat(cols - 1);
    const pass = (rows[0] ?? '') === want && (rows[1] ?? '') === '';
    return { pass, detail: 'r0.len=' + (rows[0] ?? '').length + ' r0[0]=' + JSON.stringify((rows[0] ?? '')[0]) + ' r1=' + JSON.stringify(rows[1] ?? '') };
  },
  'alt-screen-1049': async (t) => {
    await t.write('MAIN-LINE\\x1b[?1049hALT-LINE\\x1b[?1049l');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const text = rows.join('\\n');
    const pass = (rows[0] ?? '').includes('MAIN-LINE') && !text.includes('ALT-LINE');
    return { pass, detail: JSON.stringify(rows[0] ?? '') };
  },
  'decsc-decrc': async (t) => {
    await t.write('\\x1b[3;6H\\x1b7\\x1b[1;1HTOP\\x1b8HERE');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const pass = (rows[0] ?? '') === 'TOP' && (rows[2] ?? '') === '     HERE';
    return { pass, detail: JSON.stringify([rows[0], rows[2]]) };
  },
  'sync-output-2026': async (t) => {
    await t.write('\\x1b[?2026hSYNC-OK\\x1b[?2026l');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows[0] ?? '';
    return { pass: got === 'SYNC-OK', detail: JSON.stringify(got) };
  },
  'dec-line-drawing': async (t) => {
    await t.write('\\x1b(0lqqqk\\x1b(B-ok');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows[0] ?? '';
    return { pass: got === '┌───┐-ok', detail: JSON.stringify(got) };
  },
  'cjk-wide': async (t) => {
    await t.write('日本語\\x1b[1;7H!');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows[0] ?? '';
    return { pass: got === '日本語!', detail: JSON.stringify(got) };
  },
  'combining-marks': async (t) => {
    await t.write('e\\u0301\\x1b[1;2H!');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows[0] ?? '';
    const pass = got === 'e\\u0301!' || got === '\\u00e9!';
    return { pass, detail: JSON.stringify(got) };
  },
  'emoji-utf8': async (t) => {
    await t.write('café 🚀 ok');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows[0] ?? '';
    const pass = got.includes('café') && got.includes('🚀') && got.includes('ok');
    return { pass, detail: JSON.stringify(got) };
  },
  'dsr-cpr-6n': async (t) => {
    replyBuf = '';
    await t.write('\\x1b[3;7H\\x1b[6n');
    await settleFrames();
    const pass = replyBuf.includes('\\x1b[3;7R');
    return { pass, detail: JSON.stringify(replyBuf) };
  },
  'da1-primary': async (t) => {
    replyBuf = '';
    await t.write('\\x1b[c');
    await settleFrames();
    const pass = new RegExp('\\x1b\\\\[\\\\?[0-9;]*c').test(replyBuf);
    return { pass, detail: JSON.stringify(replyBuf) };
  },
  'dsr-status-5n': async (t) => {
    replyBuf = '';
    await t.write('\\x1b[5n');
    await settleFrames();
    const pass = replyBuf.includes('\\x1b[0n');
    return { pass, detail: JSON.stringify(replyBuf) };
  },
  'resize-reflow': async (t) => {
    const line = 'START-' + 'x'.repeat(90) + '-END';
    await t.write(line + '\\r\\n');
    await settleFrames();
    t.resize?.(60, 40);
    await settleFrames();
    t.resize?.(120, 40);
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const got = rows[0] ?? '';
    return { pass: got === line, detail: 'len=' + got.length + ' tail=' + JSON.stringify(got.slice(-12)) };
  },
  'tab-stops': async (t) => {
    await t.write('a\\tb\\r\\n\\x1b[3g\\x1b[2;5H\\x1bH\\x1b[2;1H1\\t2');
    await settleFrames();
    const rows = t.screen();
    if (!rows) return { pass: null, detail: 'no screen API' };
    const pass = (rows[0] ?? '') === 'a       b' && (rows[1] ?? '') === '1   2';
    return { pass, detail: JSON.stringify([rows[0], rows[1]]) };
  },
};

(window as any).runConformanceCase = async (id: string) => runOne(tests[id]);
(window as any).ready = true;
`;

const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop()!;
const binary = join(cacheDir, shellDir, readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-headless-shell"))!, "chrome-headless-shell");

const onlyIds = process.argv.slice(2);
const selected = onlyIds.length ? adapters.filter((a) => onlyIds.includes(a.id)) : adapters;

for (const adapter of selected) {
  writeFileSync(join(out, `conf-${adapter.id}.html`), html(adapter));
  writeFileSync(join(out, `conf-${adapter.id}.ts`), script(adapter));
}
const routes: Record<string, unknown> = {};
for (const a of selected) routes[`/${a.id}`] = (await import(join(out, `conf-${a.id}.html`))).default;
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", development: false, routes: routes as any });

async function measure(adapter: Adapter) {
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
    sock.addEventListener("message", (e) => { const m = JSON.parse(String(e.data)); if (m.id) waiting.get(m.id)?.(m); });
    const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++id; waiting.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
    await send("Runtime.enable");
    await send("Page.enable");
    const cases: Record<string, { pass: boolean | null; detail: string }> = {};
    for (const c of conformanceCases) {
      await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/${adapter.id}?case=${c.id}` });
      let ready = false;
      for (let i = 0; i < 150 && !ready; i++) {
        const r = await send("Runtime.evaluate", { expression: "window.ready === true", returnByValue: true });
        ready = r.result?.result?.value === true;
        if (!ready) await Bun.sleep(50);
      }
      if (!ready) { cases[c.id] = { pass: false, detail: "page never became ready" }; continue; }
      const r = await send("Runtime.evaluate", { expression: `runConformanceCase(${JSON.stringify(c.id)})`, awaitPromise: true, returnByValue: true, timeout: 30000 });
      cases[c.id] = r.result?.result?.value ?? { pass: false, detail: JSON.stringify(r.result?.exceptionDetails ?? r).slice(0, 140) };
    }
    sock.close();
    const values = Object.values(cases);
    const passed = values.filter((c) => c.pass === true).length;
    const tested = values.filter((c) => c.pass !== null).length;
    const failed = Object.entries(cases).filter(([, c]) => c.pass === false).map(([k]) => k);
    process.stderr.write(`conformance ${adapter.id}: ${passed}/${tested}${failed.length ? " fail=" + failed.join(",") : ""}\n`);
    return { id: adapter.id, version: adapter.version, passed, tested, total: conformanceCases.length, failed, cases };
  } finally {
    chrome.kill("SIGKILL");
  }
}

const terminals = [];
for (const adapter of selected) terminals.push(await measure(adapter));
server.stop(true);

const browserVersion = (await Bun.$`${binary} --version`.text()).trim();
const published = {
  generatedAt: new Date().toISOString(),
  browser: browserVersion,
  cases: conformanceCases,
  terminals,
};
writeFileSync(join(onlyIds.length ? out : join(root, "src/lib"), "conformance-results.json"), JSON.stringify(published, null, 2) + "\n");
console.table(terminals.map((t) => ({ id: t.id, score: `${t.passed}/${t.tested}`, failed: t.failed.join(", ") || "none" })));
