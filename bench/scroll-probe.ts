import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { freePort } from "./adapters";
const out = join(import.meta.dir, ".out");
mkdirSync(out, { recursive: true });
const width = 1080;
const height = 720;
const setups: Record<string, string> = {
    cloudterm: `const { mount } = await import('cloudterm'); await import('cloudterm/style.css'); const t = await mount(host, { onData() {}, predictionMode: 'off' }); return (s) => t.write(s);`,
    "xterm-dom": `const { Terminal } = await import('@xterm/xterm'); await import('@xterm/xterm/css/xterm.css'); const t = new Terminal({ scrollback: 20000 }); t.open(host); t.resize(118, 39); return (s) => new Promise((r) => t.write(s, r));`,
    wterm: `const { WTerm } = await import('@wterm/dom'); await import('@wterm/dom/css'); const t = new WTerm(host, { cols: 118, rows: 39, autoResize: false, onData() {} }); await t.init(); return (s) => t.write(s);`,
};
const only = process.argv.slice(2);
const ids = only.length ? only : Object.keys(setups);
for (const id of ids) {
    writeFileSync(join(out, `scroll-${id}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}#host{width:${width}px;height:${height}px;background:#000}</style></head><body><div id="host"></div><script type="module" src="./scroll-${id}.ts"></script></body></html>`);
    writeFileSync(join(out, `scroll-${id}.ts`), `const host = document.getElementById('host')!;
async function make(): Promise<(s: string) => unknown> { ${setups[id]} }
const write = await make();
const lines = Array.from({ length: 10000 }, (_, i) => 'line ' + i + ' ' + 'abcdefghij'.repeat(9));
await write(lines.join('\\r\\n'));
await new Promise((r) => setTimeout(r, 500));
(window as any).ready = true;
`);
}
const routes: Record<string, unknown> = {};
for (const id of ids)
    routes[`/${id}`] = (await import(join(out, `scroll-${id}.html`))).default;
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", development: false, routes: routes as any });
const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = readdirSync(cacheDir).filter((d) => d.startsWith("chromium-")).sort().pop()!;
const appDir = readdirSync(join(cacheDir, shellDir)).find((d) => d.startsWith("chrome-mac"))!;
const appName = readdirSync(join(cacheDir, shellDir, appDir)).find((d) => d.endsWith(".app"))!;
const binary = join(cacheDir, shellDir, appDir, appName, "Contents/MacOS", appName.replace(/\.app$/, ""));
async function probe(id: string, port: number) {
    const chrome = spawn(binary, ["--headless=new", `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, "--hide-scrollbars", `--user-data-dir=${join(out, "profile-" + port)}`, "about:blank"], { stdio: "ignore" });
    try {
        let ws = "";
        for (let i = 0; i < 100 && !ws; i++) {
            try {
                ws = ((await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as any[]).find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
            }
            catch { }
            if (!ws)
                await Bun.sleep(100);
        }
        const sock = new WebSocket(ws);
        await new Promise((r) => sock.addEventListener("open", r, { once: true }));
        let n = 0;
        const waiting = new Map<number, (v: any) => void>();
        const frames: Buffer[] = [];
        sock.addEventListener("message", (e) => {
            const m = JSON.parse(String(e.data));
            if (m.id)
                waiting.get(m.id)?.(m);
            if (m.method === "Page.screencastFrame") {
                frames.push(Buffer.from(m.params.data, "base64"));
                sock.send(JSON.stringify({ id: ++n, method: "Page.screencastFrameAck", params: { sessionId: m.params.sessionId } }));
            }
        });
        const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++n; waiting.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
        await send("Page.enable");
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/${id}` });
        for (let i = 0; i < 200; i++) {
            const r = await send("Runtime.evaluate", { expression: "window.ready === true", returnByValue: true });
            if (r.result?.result?.value)
                break;
            await Bun.sleep(100);
        }
        await send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: width, maxHeight: height });
        await Bun.sleep(300);
        frames.length = 0;
        for (const distance of [-6000, 4000, -9000, 9000]) {
            await send("Input.synthesizeScrollGesture", { x: width / 2, y: height / 2, yDistance: -distance, speed: 8000, gestureSourceType: "mouse", repeatCount: 1 });
        }
        await Bun.sleep(300);
        await send("Page.stopScreencast");
        sock.close();
        let blankFrames = 0;
        let worst = 0;
        const band = 16;
        for (const png of frames) {
            const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
            const bandsTotal = Math.floor(info.height / band);
            let blank = 0;
            for (let b = 0; b < bandsTotal; b++) {
                let lit = 0;
                for (let y = b * band; y < (b + 1) * band; y++)
                    for (let x = 0; x < info.width; x += 2)
                        if (data[y * info.width + x] > 60)
                            lit++;
                if (lit < 4)
                    blank++;
            }
            const fraction = blank / bandsTotal;
            if (fraction > 0.1)
                blankFrames++;
            worst = Math.max(worst, fraction);
            if (fraction === worst && fraction > 0.1)
                await Bun.write(join(out, `worst-${id}.png`), png);
        }
        return { id, frames: frames.length, blankFrames, blankPct: frames.length ? Math.round((blankFrames / frames.length) * 100) : 0, worstBlankScreen: `${Math.round(worst * 100)}%` };
    }
    finally {
        chrome.kill("SIGKILL");
    }
}
const results = [];
for (const id of ids)
    results.push(await probe(id, freePort()));
server.stop(true);
console.table(results);
if (results.some((r) => r.blankFrames > 0 && r.id.startsWith("cloudterm")))
    process.exit(1);
