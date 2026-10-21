import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cloudterm = "/Users/jcoeyman/cloudflare/cloudterm";
const fixture = join(import.meta.dir, ".out", "flame-hang");
mkdirSync(fixture, { recursive: true });

function fakeBrowser(name: string, answeredMethods: string[]): string {
  const path = join(fixture, name);
  const source = `#!/usr/bin/env bun
const portArg = process.argv.find((arg) => arg.startsWith("--remote-debugging-port="));
const port = Number(portArg?.split("=")[1]);
const answered = new Set(${JSON.stringify(answeredMethods)});
Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/json") return Response.json([{ type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:" + port + "/page" }]);
    if (server.upgrade(request)) return undefined;
    return new Response("not found", { status: 404 });
  },
  websocket: {
    message(socket, raw) {
      const message = JSON.parse(String(raw));
      if (answered.has(message.method)) socket.send(JSON.stringify({ id: message.id, result: { result: { value: true } } }));
    },
  },
});
setInterval(() => {}, 1000);
`;
  writeFileSync(path, source);
  chmodSync(path, 0o755);
  return path;
}

async function runAgainst(browser: string): Promise<{ exitCode: number; output: string; seconds: number }> {
  const started = performance.now();
  const child = Bun.spawn(["bun", join(import.meta.dir, "flame.ts"), "--runs", "1", "--out", join(fixture, "out"), cloudterm, "sgr-tokens"], {
    env: { ...process.env, FLAME_CHROME: browser, FLAME_CALL_TIMEOUT_MS: "5000" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const killer = setTimeout(() => child.kill(9), 90000);
  const exitCode = await child.exited;
  clearTimeout(killer);
  const output = (await new Response(child.stdout).text()) + (await new Response(child.stderr).text());
  return { exitCode, output, seconds: (performance.now() - started) / 1000 };
}

test("a browser that never answers any call makes flame.ts fail fast, naming the call", async () => {
  const { exitCode, output, seconds } = await runAgainst(fakeBrowser("silent.ts", []));
  expect(seconds).toBeLessThan(60);
  expect(exitCode).not.toBe(0);
  expect(output).toMatch(/Runtime\.enable/);
  expect(output.toLowerCase()).toMatch(/time(d)? ?out/);
}, 120000);

test("a browser that hangs on the workload call makes flame.ts fail fast, naming that call", async () => {
  const { exitCode, output, seconds } = await runAgainst(fakeBrowser("stuck-evaluate.ts", ["Runtime.enable", "Log.enable", "Page.enable", "Page.navigate", "Profiler.enable", "Profiler.setSamplingInterval", "HeapProfiler.collectGarbage"]));
  expect(seconds).toBeLessThan(60);
  expect(exitCode).not.toBe(0);
  expect(output).toMatch(/Runtime\.evaluate/);
  expect(output.toLowerCase()).toMatch(/time(d)? ?out/);
}, 120000);

test("the default timeout is finite and long enough for the real workload", async () => {
  const source = await Bun.file(join(import.meta.dir, "flame.ts")).text();
  expect(source).toMatch(/FLAME_CALL_TIMEOUT_MS/);
  expect(source).toMatch(/FLAME_CHROME/);
  const match = source.match(/FLAME_CALL_TIMEOUT_MS[^\n]*?\?\?\s*"?(\d+)"?/);
  expect(match).not.toBeNull();
  const defaultMs = Number(match![1]);
  expect(defaultMs).toBeGreaterThanOrEqual(30000);
  expect(defaultMs).toBeLessThanOrEqual(120000);
});

afterAll(() => rmSync(fixture, { recursive: true, force: true }));
