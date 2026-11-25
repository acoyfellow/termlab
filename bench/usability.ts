import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { adapters, freePort, root, type Adapter } from "./adapters";

const out = join(import.meta.dir, ".out");
mkdirSync(out, { recursive: true });

export type UsabilityCase = {
  id: string;
  name: string;
};

export const usabilityCases: UsabilityCase[] = [
  { id: "single-key-no-ghost", name: "Single keystroke renders once with no ghost duplicate" },
  { id: "typing-and-backspace", name: "Typing and Backspace edit cleanly with no ghost overlay" },
  { id: "duplicate-keydown-input", name: "Keydown + same-char input emits once (no 2x/3x)" },
  { id: "ime-composition", name: "IME composition emits committed text once" },
  { id: "space-and-punctuation", name: "Space and punctuation echo cleanly" },
  { id: "paste-once", name: "Paste emits payload once" },
  { id: "bracketed-paste", name: "Bracketed paste (?2004h) wraps pasted bytes" },
  { id: "native-selection", name: "Native browser text selection reads terminal text" },
  { id: "scrollback-stay", name: "Wheel scroll into scrollback moves and stays up" },
  { id: "click-focus-ctrl-c", name: "Click focuses terminal and Ctrl+C emits ETX cleanly" },
];

const defaultSetup = (adapter: Adapter) =>
  adapter.id === "cloudterm"
    ? adapter.setup.replace(", predictionMode: 'off'", "")
    : adapter.setup;

const html = (adapter: Adapter) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}#host{width:1080px;height:720px}</style></head>
<body><div id="host"></div><script type="module" src="./use-${adapter.id}.ts"></script></body></html>`;

const script = (adapter: Adapter) => `import '@xterm/xterm/css/xterm.css';
const host = document.getElementById('host');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
function bufferText(t) { const b = t.buffer?.active; if (!b) return ''; let s = ''; for (let i = Math.max(0, b.length - 45); i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\\n'; return s; }
function bufferScreen(t) { const b = t.buffer?.active; if (!b) return []; const out = []; for (let i = 0; i < t.rows; i++) out.push(b.getLine(b.baseY + i)?.translateToString(true) ?? ''); return out; }
let inputLog = '';
let echoEnabled = false;
let activeTerm: any = null;
(window as any).__axInput = (d) => {
  const s = String(d);
  inputLog += s;
  if (echoEnabled && activeTerm) {
    if (s === '\\x7f' || s === '\\b') activeTerm.write('\\b \\b');
    else if (s === '\\r') activeTerm.write('\\r\\n$ ');
    else if (s >= ' ') activeTerm.write(s);
  }
};
async function make(): Promise<any> { ${defaultSetup(adapter)} }
async function settleFrames() { await nextFrame(); await nextFrame(); await new Promise((r) => setTimeout(r, 40)); }

(window as any).useMount = async (echo = false) => {
  host.innerHTML = '';
  host.style.width = '1080px';
  host.style.height = '720px';
  inputLog = '';
  echoEnabled = echo;
  activeTerm = await make();
  await settleFrames();
  if (echo) {
    await activeTerm.write('$ ');
    await settleFrames();
  }
  return true;
};
(window as any).useTakeInput = () => { const r = inputLog; inputLog = ''; return r; };
(window as any).useWrite = async (s: string) => { await activeTerm.write(s); await settleFrames(); };
(window as any).useState = () => {
  const screen = activeTerm?.screen ? activeTerm.screen() : null;
  const preds = [...host.querySelectorAll('.cloudterm-predictions span')].map((el) => el.textContent ?? '');
  const domText = (host.innerText || '').trim();
  const ta = host.querySelector('textarea') as HTMLTextAreaElement | null;
  const focused = host.contains(document.activeElement);
  return { screen, preds, domText, hasTa: Boolean(ta), focused };
};
(window as any).useFocusRect = () => {
  const r = host.getBoundingClientRect();
  return { x: r.left + 80, y: r.top + 80 };
};
(window as any).useDupKeydownInput = () => {
  const ta = host.querySelector('textarea') as HTMLTextAreaElement | null;
  if (!ta) return { supported: false };
  ta.focus();
  inputLog = '';
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, bubbles: true, cancelable: true }));
  ta.value = 'a';
  ta.dispatchEvent(new InputEvent('input', { data: 'a', inputType: 'insertText', bubbles: true }));
  return { supported: true, got: inputLog };
};
(window as any).useIme = () => {
  const ta = host.querySelector('textarea') as HTMLTextAreaElement | null;
  if (!ta) return { supported: false };
  ta.focus();
  inputLog = '';
  ta.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }));
  ta.value = 'n';
  ta.dispatchEvent(new InputEvent('input', { data: 'n', isComposing: true, inputType: 'insertCompositionText', bubbles: true }));
  ta.value = '日';
  ta.dispatchEvent(new CompositionEvent('compositionend', { data: '日', bubbles: true }));
  ta.value = '日';
  ta.dispatchEvent(new InputEvent('input', { data: '日', isComposing: false, inputType: 'insertFromComposition', bubbles: true }));
  return { supported: true, got: inputLog };
};
(window as any).usePaste = (text: string) => {
  const target = (host.querySelector('textarea') ?? document.activeElement ?? host) as HTMLElement;
  target.focus();
  inputLog = '';
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return inputLog;
};
(window as any).useNativeSelect = () => {
  const sel = window.getSelection();
  if (!sel) return '';
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(host);
  sel.addRange(range);
  const txt = sel.toString();
  sel.removeAllRanges();
  return txt;
};
(window as any).useScrollPos = () => {
  const scrollables = [host, ...host.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 20);
  const best = scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? null;
  const screen = activeTerm?.screen ? activeTerm.screen() : null;
  const vpY = activeTerm?.viewportY ? activeTerm.viewportY() : null;
  return {
    top: best ? Math.round(best.scrollTop) : null,
    max: best ? Math.round(best.scrollHeight - best.clientHeight) : null,
    vpY,
    lastLine: screen ? screen.filter((l) => l.trim()).pop() ?? '' : '',
  };
};
(window as any).ready = true;
`;

const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop()!;
const binary = join(cacheDir, shellDir, readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-headless-shell"))!, "chrome-headless-shell");

const onlyIds = process.argv.slice(2);
const selected = onlyIds.length ? adapters.filter((a) => onlyIds.includes(a.id)) : adapters;

for (const adapter of selected) {
  writeFileSync(join(out, `use-${adapter.id}.html`), html(adapter));
  writeFileSync(join(out, `use-${adapter.id}.ts`), script(adapter));
}
const routes: Record<string, unknown> = {};
for (const a of selected) routes[`/${a.id}`] = (await import(join(out, `use-${a.id}.html`))).default;
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
    const ev = async (expression: string) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 30000 })).result?.result?.value;
    await send("Runtime.enable");
    await send("Page.enable");

    const openFresh = async (echo: boolean, tag: string) => {
      await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/${adapter.id}?u=${tag}` });
      let ready = false;
      for (let i = 0; i < 150 && !ready; i++) {
        ready = (await ev("window.ready === true")) === true;
        if (!ready) await Bun.sleep(50);
      }
      if (!ready) throw new Error("page never became ready");
      await ev(`useMount(${echo})`);
      const rect = await ev("useFocusRect()");
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
      await Bun.sleep(60);
    };

    const keyMap: Record<string, [string, number]> = {
      " ": ["Space", 32],
      ".": ["Period", 190],
      "/": ["Slash", 191],
      "-": ["Minus", 189],
    };
    const pressChar = async (ch: string) => {
      const mapped = keyMap[ch];
      const code = mapped ? mapped[0] : ch >= "a" && ch <= "z" ? "Key" + ch.toUpperCase() : "";
      const vk = mapped ? mapped[1] : ch >= "a" && ch <= "z" ? ch.toUpperCase().charCodeAt(0) : ch.charCodeAt(0);
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await send("Input.dispatchKeyEvent", { type: "char", text: ch, unmodifiedText: ch, key: ch });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    };

    const pressKey = async (key: string, code: string, vk: number, modifiers = 0) => {
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    };

    const cases: Record<string, { pass: boolean; detail: string }> = {};

    await openFresh(true, "single");
    await pressChar("h");
    await Bun.sleep(100);
    const s1 = await ev("useState()");
    const line1 = s1.screen ? (s1.screen.filter((l: string) => l.trim()).pop() ?? "") : null;
    const domHasDouble = s1.domText.includes("$ hh");
    const ok1 = s1.preds.length === 0 && !domHasDouble && (line1 === null ? (await ev("useTakeInput()")) === "h" : line1 === "$ h");
    cases["single-key-no-ghost"] = { pass: ok1, detail: `line=${JSON.stringify(line1)} preds=${s1.preds.length}` };

    await openFresh(true, "edit");
    for (const ch of "helxo") await pressChar(ch);
    await pressKey("Backspace", "Backspace", 8);
    await pressKey("Backspace", "Backspace", 8);
    for (const ch of "lo") await pressChar(ch);
    await Bun.sleep(100);
    const s2 = await ev("useState()");
    const line2 = s2.screen ? (s2.screen.filter((l: string) => l.trim()).pop() ?? "") : null;
    const ok2 = s2.preds.length === 0 && (line2 === null ? false : line2 === "$ hello");
    cases["typing-and-backspace"] = { pass: ok2, detail: `line=${JSON.stringify(line2)} preds=${s2.preds.length}` };

    await openFresh(false, "dup");
    const d3 = await ev("useDupKeydownInput()");
    cases["duplicate-keydown-input"] = { pass: d3.supported && d3.got === "a", detail: d3.supported ? JSON.stringify(d3.got) : "no textarea" };

    await openFresh(false, "ime");
    const d4 = await ev("useIme()");
    await Bun.sleep(80);
    const imeGot = d4.supported ? await ev("useTakeInput()") : "";
    cases["ime-composition"] = { pass: d4.supported && imeGot === "日", detail: d4.supported ? JSON.stringify(imeGot) : "no textarea" };

    await openFresh(true, "space");
    for (const ch of "a b.c/d-e") await pressChar(ch);
    await Bun.sleep(100);
    const s5 = await ev("useState()");
    const line5 = s5.screen ? (s5.screen.filter((l: string) => l.trim()).pop() ?? "") : null;
    cases["space-and-punctuation"] = { pass: s5.preds.length === 0 && line5 === "$ a b.c/d-e", detail: JSON.stringify(line5) };

    await openFresh(false, "paste");
    const p6 = await ev('usePaste("echo pasted")');
    cases["paste-once"] = { pass: p6 === "echo pasted", detail: JSON.stringify(p6) };

    await openFresh(false, "bpaste");
    await ev('useWrite("\\x1b[?2004h")');
    const p7 = await ev('usePaste("hello")');
    cases["bracketed-paste"] = { pass: p7 === "\x1b[200~hello\x1b[201~", detail: JSON.stringify(p7) };

    await openFresh(false, "select");
    await ev('useWrite("SELECT-ME-42\\r\\n")');
    await Bun.sleep(220);
    const sel8 = await ev("useNativeSelect()");
    cases["native-selection"] = { pass: typeof sel8 === "string" && sel8.includes("SELECT-ME-42"), detail: JSON.stringify(String(sel8).slice(0, 60)) };

    await openFresh(false, "scroll");
    const lines300 = Array.from({ length: 300 }, (_, i) => `scroll-row-${i}`).join("\r\n") + "\r\n";
    await ev(`useWrite(${JSON.stringify(lines300)})`);
    const before9 = await ev("useScrollPos()");
    const rect9 = await ev("useFocusRect()");
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: rect9.x, y: rect9.y, deltaX: 0, deltaY: -400 });
    await Bun.sleep(180);
    const after9 = await ev("useScrollPos()");
    const movedDom = before9.top !== null && after9.top !== null && after9.top < before9.top;
    const movedVp = before9.vpY !== null && after9.vpY !== null && after9.vpY < before9.vpY;
    const movedScreen = Boolean(before9.lastLine && after9.lastLine && after9.lastLine !== before9.lastLine);
    cases["scrollback-stay"] = { pass: movedDom || movedVp || movedScreen, detail: `top ${before9.top}->${after9.top} vpY ${before9.vpY}->${after9.vpY} last ${JSON.stringify(before9.lastLine)}->${JSON.stringify(after9.lastLine)}` };

    await openFresh(true, "ctrlc");
    const s10a = await ev("useState()");
    await ev("useTakeInput()");
    await pressKey("c", "KeyC", 67, 2);
    await Bun.sleep(80);
    const got10 = await ev("useTakeInput()");
    const s10b = await ev("useState()");
    const line10 = s10b.screen ? (s10b.screen.filter((l: string) => l.trim()).pop() ?? "") : null;
    cases["click-focus-ctrl-c"] = { pass: s10a.focused && got10 === "\x03" && (line10 === null || line10.trim() === "$"), detail: `focused=${s10a.focused} got=${JSON.stringify(got10)} line=${JSON.stringify(line10)}` };

    sock.close();
    const values = Object.values(cases);
    const passed = values.filter((c) => c.pass).length;
    const failed = Object.entries(cases).filter(([, c]) => !c.pass).map(([k]) => k);
    process.stderr.write(`usability ${adapter.id}: ${passed}/${values.length}${failed.length ? " fail=" + failed.join(",") : ""}\n`);
    return { id: adapter.id, version: adapter.version, passed, total: values.length, failed, cases };
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
  cases: usabilityCases,
  terminals,
};
writeFileSync(join(onlyIds.length ? out : join(root, "src/lib"), "usability-results.json"), JSON.stringify(published, null, 2) + "\n");
console.table(terminals.map((t) => ({ id: t.id, score: `${t.passed}/${t.total}`, failed: t.failed.join(", ") || "none" })));
