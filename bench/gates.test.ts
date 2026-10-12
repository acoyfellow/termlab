import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hasCurrentCloudtermPerfVersion } from "./ax-gate";
import { hasCurrentPerfBenchmarkVersion } from "./gate";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

const fixture = (version: string) => {
  const directory = mkdtempSync(join(tmpdir(), "termlab-gate-"));
  directories.push(directory);
  const packagePath = join(directory, "package.json");
  const resultsPath = join(directory, "results.json");
  writeFileSync(packagePath, JSON.stringify({ dependencies: { "cloudterm-perf": "github:acoyfellow/cloudterm#abc1234" } }));
  writeFileSync(resultsPath, JSON.stringify({ terminals: [{ id: "cloudterm-perf", version }] }));
  return { packagePath, resultsPath };
};

test("AX gate freshness requires the pinned cloudterm-perf SHA", () => {
  const fresh = fixture("main abc1234");
  const stale = fixture("main deadbee");
  expect(hasCurrentCloudtermPerfVersion(fresh.resultsPath, fresh.packagePath)).toBe(true);
  expect(hasCurrentCloudtermPerfVersion(stale.resultsPath, stale.packagePath)).toBe(false);
});

test("performance gate freshness requires the pinned cloudterm-perf SHA", () => {
  const fresh = fixture("main abc1234");
  const stale = fixture("0.0.13");
  expect(hasCurrentPerfBenchmarkVersion(fresh.resultsPath, fresh.packagePath)).toBe(true);
  expect(hasCurrentPerfBenchmarkVersion(stale.resultsPath, stale.packagePath)).toBe(false);
});
