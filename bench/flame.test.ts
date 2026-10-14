import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const cloudterm = "/Users/jcoeyman/cloudflare/cloudterm";
const fixture = join(import.meta.dir, ".out", "flame", "planted-test");
const clean = join(fixture, "clean");
const planted = join(fixture, "planted");

function digest(path: string) {
  const result = Bun.spawnSync(["shasum", "-a", "256", ...Bun.spawnSync(["find", path, "-type", "f", "-print"]).stdout.toString().trim().split("\n").sort()]);
  return createHash("sha256").update(result.stdout).digest("hex");
}

function copy(source: string, destination: string) {
  cpSync(source, destination, { recursive: true, filter: (path) => !["node_modules", ".git", ".loop-wt"].includes(path.split("/").pop() ?? "") });
}

const sourceBefore = digest(join(cloudterm, "src"));
const distBefore = digest(join(cloudterm, "dist"));

mkdirSync(fixture, { recursive: true });
rmSync(clean, { recursive: true, force: true });
rmSync(planted, { recursive: true, force: true });
copy(cloudterm, clean);
copy(cloudterm, planted);
const parser = join(planted, "src", "parser.ts");
const text = readFileSync(parser, "utf8");
const insertion = "function plantedSgrDelay(): void {\n  const count = ((globalThis as any).__flamePlantedCount ?? 0) + 1;\n  (globalThis as any).__flamePlantedCount = count;\n  if (count !== 200001) return;\n  const end = performance.now() + 3;\n  while (performance.now() < end) {}\n}\n\n";
const marker = "function quickSgr(current: CellAttr, code: number): CellAttr | null {\n";
const line = text.slice(0, text.indexOf(marker)).split("\n").length;
writeFileSync(parser, text.replace(marker, insertion + marker + "  plantedSgrDelay();\n"));

async function diff(a: string, b: string) {
  const result = await Bun.$`bun bench/flame.ts --diff ${a} ${b} sgr-tokens --runs 3 --json`.quiet();
  return JSON.parse(result.stdout.toString());
}

test("flame identifies a planted parser delay and leaves cloudterm untouched", async () => {
  const rows = await diff(clean, planted);
  const first = rows.find((row: any) => row.significant && row.delta > 0);
  expect(first.fn).toBe("plantedSgrDelay");
  expect(first.source).toMatch(new RegExp(`src/parser\\.ts:${line - 3}|src/parser\\.ts:${line - 2}|src/parser\\.ts:${line - 1}|src/parser\\.ts:${line}|src/parser\\.ts:${line + 1}|src/parser\\.ts:${line + 2}|src/parser\\.ts:${line + 3}`));
  expect(digest(join(cloudterm, "src"))).toBe(sourceBefore);
  expect(digest(join(cloudterm, "dist"))).toBe(distBefore);
}, 180000);

test("flame reports no significant differences for the same checkout", async () => {
  const rows = await diff(clean, clean);
  expect(rows.filter((row: any) => row.significant)).toEqual([]);
}, 180000);

afterAll(() => rmSync(fixture, { recursive: true, force: true }));
