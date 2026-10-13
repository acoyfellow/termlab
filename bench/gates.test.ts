import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hasCurrentCloudtermVersion } from "./ax-gate";
import { hasCurrentPerfBenchmarkVersion } from "./gate";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

const fixture = (version: string) => {
  const directory = mkdtempSync(join(tmpdir(), "termlab-gate-"));
  directories.push(directory);
  const packagePath = join(directory, "package.json");
  const resultsPath = join(directory, "results.json");
  writeFileSync(packagePath, JSON.stringify({ dependencies: { cloudterm: "github:acoyfellow/cloudterm#abc1234" } }));
  writeFileSync(resultsPath, JSON.stringify({ terminals: [{ id: "cloudterm", version }] }));
  return { packagePath, resultsPath };
};

test("AX gate freshness requires the installed cloudterm version", () => {
  const fresh = fixture("abc1234");
  const stale = fixture("deadbee");
  expect(hasCurrentCloudtermVersion(fresh.resultsPath, fresh.packagePath)).toBe(true);
  expect(hasCurrentCloudtermVersion(stale.resultsPath, stale.packagePath)).toBe(false);
});

test("performance gate freshness requires the installed cloudterm version", () => {
  const fresh = fixture("abc1234");
  const stale = fixture("0.0.13");
  expect(hasCurrentPerfBenchmarkVersion(fresh.resultsPath, fresh.packagePath)).toBe(true);
  expect(hasCurrentPerfBenchmarkVersion(stale.resultsPath, stale.packagePath)).toBe(false);
});
