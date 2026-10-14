import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { freePort } from "./adapters";

const url = process.argv[2] ?? "http://127.0.0.1:5182/";
const root = join(import.meta.dir, "..");
const axeSource = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8");
const bench = JSON.parse(readFileSync(join(root, "src/lib/bench-results.json"), "utf8"));
const cloudterm = bench.terminals.find((t: { id: string }) => t.id === "cloudterm");
const workloads = ["scroll-flood", "full-redraw", "sgr-tokens"] as const;
const keyNumbers: string[] = [...workloads.map((w) => `${cloudterm.timings[w].medianMs} ms`), `${cloudterm.mountMs} ms`];
const allNumbers: Array<{ id: string; value: string }> = bench.terminals.flatMap((t: any) =>
  workloads.map((w) => ({ id: t.id, value: String(t.timings[w].medianMs) })),
);

const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop()!;
const binary = join(cacheDir, shellDir, readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-headless-shell"))!, "chrome-headless-shell");

type Check = { name: string; pass: boolean; detail: string };

async function inspect(width: number, height: number, mobile: boolean) {
  const port = freePort();
  const chrome = spawn(binary, [`--remote-debugging-port=${port}`, `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });
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
    const evaluate = async (expression: string) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 3 : 1, mobile });
    await send("Page.enable");
    await send("Page.navigate", { url });
    await Bun.sleep(4000);
    const layout = await evaluate(`(() => {
      const text = (el) => (el.innerText || '').replace(/\\s+/g, ' ');
      const visible = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0 && el.children.length === 0; }).map(text).join(' ');
      return { scrollWidth: document.documentElement.scrollWidth, innerWidth: document.documentElement.clientWidth, viewport: innerWidth, aboveFold: visible, verdict: !!document.querySelector('[data-verdict]'), verdictTop: document.querySelector('[data-verdict]')?.getBoundingClientRect().top ?? null, full: text(document.body) };
    })()`);
    const axe = await evaluate(`(async () => { ${axeSource}; const r = await axe.run(document, { resultTypes: ['violations'] }); return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ' x' + v.nodes.length); })()`);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    sock.close();
    return { layout, axe: axe as string[], png: shot.result?.data as string };
  } finally {
    chrome.kill("SIGKILL");
  }
}

const phone = await inspect(390, 844, true);
const desktop = await inspect(1280, 800, false);
const checks: Check[] = [];
checks.push({ name: "no horizontal scroll at 390px", pass: phone.layout.viewport === 390 && phone.layout.scrollWidth <= 390, detail: `viewport ${phone.layout.viewport}, scrollWidth ${phone.layout.scrollWidth}` });
checks.push({ name: "verdict element above fold on phone", pass: phone.layout.verdict && phone.layout.verdictTop != null && phone.layout.verdictTop < 844, detail: `[data-verdict] top ${phone.layout.verdictTop}` });
const missingFold = keyNumbers.filter((n) => !phone.layout.aboveFold.includes(n));
checks.push({ name: "cloudterm 4 key numbers above fold on phone", pass: missingFold.length === 0, detail: missingFold.length ? `missing ${missingFold.join(", ")}` : keyNumbers.join(", ") });
const missingAll = allNumbers.filter((n) => !desktop.layout.full.includes(n.value));
checks.push({ name: "every results-JSON timing on page", pass: missingAll.length === 0, detail: missingAll.length ? `missing ${missingAll.slice(0, 5).map((n) => n.id + "=" + n.value).join(", ")}` : `${allNumbers.length} values` });
const axeAll = [...phone.axe, ...desktop.axe];
checks.push({ name: "zero serious/critical axe violations", pass: axeAll.length === 0, detail: axeAll.join(", ") || "none" });

const out = process.env.UI_SHOTS;
if (out) { await Bun.write(`${out}-390.png`, Buffer.from(phone.png, "base64")); await Bun.write(`${out}-1280.png`, Buffer.from(desktop.png, "base64")); }
console.log(`ui-check ${url}`);
for (const c of checks) console.log(`  ${c.pass ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
process.exit(checks.every((c) => c.pass) ? 0 : 1);
