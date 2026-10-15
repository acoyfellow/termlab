import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const cloudterm = "/Users/jcoeyman/cloudflare/cloudterm";
const fixture = join(import.meta.dir, ".out", "flame", "judge");
const cleanA = join(fixture, "clean-a");
const cleanB = join(fixture, "clean-b");
const planted = join(fixture, "planted");
const flameSource = readFileSync(join(import.meta.dir, "flame.ts"), "utf8");

type Row = { fn: string; source: string; delta: number; significant: boolean };

function digest(path: string): string {
  const files = Bun.spawnSync(["find", path, "-type", "f"]).stdout.toString().trim().split("\n").sort();
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update(readFileSync(file));
  return hash.digest("hex");
}

function copyCheckout(destination: string): void {
  rmSync(destination, { recursive: true, force: true });
  cpSync(cloudterm, destination, { recursive: true, filter: (path) => !["node_modules", ".git", ".loop-wt", "dist"].includes(path.split("/").pop() ?? "") });
}

function plantDelayInHandleSgr(root: string): void {
  const parser = join(root, "src", "parser.ts");
  const text = readFileSync(parser, "utf8");
  const signature = "  private handleSgr(): void {\n";
  if (!text.includes(signature)) throw new Error("handleSgr signature not found");
  const delay = "    { const until = performance.now() + 0.0002; while (performance.now() < until) {} }\n";
  writeFileSync(parser, text.replace(signature, signature + delay));
}

async function diff(a: string, b: string): Promise<{ rows: Row[]; seconds: number }> {
  const started = performance.now();
  const result = await Bun.$`bun ${join(import.meta.dir, "flame.ts")} --diff ${a} ${b} sgr-tokens --runs 3 --json`.quiet();
  return { rows: JSON.parse(result.stdout.toString()), seconds: (performance.now() - started) / 1000 };
}

const sourceBefore = digest(join(cloudterm, "src"));
const distBefore = digest(join(cloudterm, "dist"));
mkdirSync(fixture, { recursive: true });
copyCheckout(cleanA);
copyCheckout(cleanB);
copyCheckout(planted);
plantDelayInHandleSgr(planted);

test("flame.ts has no shortcut paths", () => {
  expect(flameSource).not.toMatch(/resolve\(a\)\s*===\s*resolve\(b\)/);
  expect(flameSource).not.toMatch(/addedFunctions/);
  expect(flameSource).not.toMatch(/functionNames\(/);
});

test("a delay planted inside existing handleSgr ranks first as significantly slower", async () => {
  const { rows } = await diff(cleanA, planted);
  const slower = rows.filter((row) => row.significant && row.delta > 0).sort((x, y) => y.delta - x.delta);
  expect(slower.length).toBeGreaterThan(0);
  expect(slower[0]!.fn).toBe("handleSgr");
  expect(slower[0]!.source).toMatch(/^src\/parser\.ts:\d+$/);
  expect(slower[0]!.delta).toBeGreaterThan(1);
}, 600000);

test("two separate copies of the same checkout, both profiled, flag nothing", async () => {
  const { rows, seconds } = await diff(cleanA, cleanB);
  expect(seconds).toBeGreaterThan(5);
  expect(rows.length).toBeGreaterThan(10);
  expect(rows.filter((row) => row.significant)).toEqual([]);
}, 600000);

test("the real cloudterm checkout is untouched", () => {
  expect(digest(join(cloudterm, "src"))).toBe(sourceBefore);
  expect(digest(join(cloudterm, "dist"))).toBe(distBefore);
});

afterAll(() => rmSync(fixture, { recursive: true, force: true }));
