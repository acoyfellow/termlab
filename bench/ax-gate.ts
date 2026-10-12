import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Read = { matched: number; total: number; tokens: number };
type Terminal = {
  id: string;
  version: string;
  canvas: boolean;
  readableDomMs: number | null;
  reads: { innerText: Read; accessibility: Read };
  input: { passed: number; total: number };
};
type AdoptionRun = {
  id: string;
  tokens: number;
  toolCalls: number;
  costUsd: number;
  markerInDom: boolean;
  writeWorks: boolean;
  inputWorks: boolean;
};
type AdoptionResults = { model: string; runs: number; results: AdoptionRun[] };

export function cloudtermPerfSha(packagePath: string): string | null {
  const dependency = JSON.parse(readFileSync(packagePath, "utf8")).dependencies?.["cloudterm-perf"];
  const match = typeof dependency === "string" && dependency.match(/^github:acoyfellow\/cloudterm#([0-9a-f]+)$/i);
  return match?.[1] ?? null;
}

export function hasCurrentCloudtermPerfVersion(resultsPath: string, packagePath: string): boolean {
  const sha = cloudtermPerfSha(packagePath);
  if (!sha) return false;
  const results = JSON.parse(readFileSync(resultsPath, "utf8")) as { terminals?: Array<{ id: string; version: string }> };
  return results.terminals?.find((terminal) => terminal.id === "cloudterm-perf")?.version.includes(sha) ?? false;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
};
const number = (value: number | null) => value == null ? "n/a" : value.toFixed(1);
const ownFamily = (id: string) => id.startsWith("cloudterm") || id.startsWith("planted");

export function runAxGate(resultsPath: string, packagePath: string, adoptionPath: string): number {
  if (!hasCurrentCloudtermPerfVersion(resultsPath, packagePath)) {
    console.log("gate: stale or missing cloudterm-perf AX results");
    return 2;
  }
  const results = JSON.parse(readFileSync(resultsPath, "utf8")) as { generatedAt: string; terminals: Terminal[] };
  const subject = results.terminals.find((terminal) => terminal.id === "cloudterm-perf");
  if (!subject) {
    console.log("gate: no row for cloudterm-perf");
    return 2;
  }
  const rivals = results.terminals.filter((terminal) => !ownFamily(terminal.id));
  if (!rivals.length) {
    console.log("gate: no rivals");
    return 2;
  }
  let passed = true;
  const check = (name: string, mine: number | null, rival: number | null, comparison: string) => {
    const ok = mine != null && rival != null && (comparison === ">=" ? mine >= rival : mine <= rival);
    passed &&= ok;
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}: ${number(mine)} ${comparison} ${number(rival)}`);
  };
  check("innerText lines", subject.reads.innerText.matched, Math.max(...rivals.map((terminal) => terminal.reads.innerText.matched)), ">=");
  check("accessibility lines", subject.reads.accessibility.matched, Math.max(...rivals.map((terminal) => terminal.reads.accessibility.matched)), ">=");
  check("input passed", subject.input.passed, Math.max(...rivals.map((terminal) => terminal.input.passed)), ">=");
  const readableRivals = rivals.map((terminal) => terminal.readableDomMs).filter((value): value is number => value != null);
  check("readable DOM ms", subject.readableDomMs, readableRivals.length ? Math.min(...readableRivals) + 17 : null, "<=");
  const correctDom = rivals.filter((terminal) => terminal.reads.innerText.matched === terminal.reads.innerText.total);
  check("innerText tokens", subject.reads.innerText.tokens, correctDom.length ? Math.min(...correctDom.map((terminal) => terminal.reads.innerText.tokens)) : null, "<=");
  if (!existsSync(adoptionPath)) {
    console.log("  SKIP adoption: no results");
  } else {
    const adoption = JSON.parse(readFileSync(adoptionPath, "utf8")) as AdoptionResults;
    const grouped = new Map<string, AdoptionRun[]>();
    for (const run of adoption.results) grouped.set(run.id, [...(grouped.get(run.id) ?? []), run]);
    const cloudterm = grouped.get("cloudterm") ?? [];
    const eligible = [...grouped.entries()].filter(([id, runs]) => !id.startsWith("planted") && id !== "cloudterm" && runs.length >= 3 && runs.every((run) => (run.markerInDom || run.writeWorks) && run.inputWorks));
    if (cloudterm.length < 3 || !eligible.length) {
      console.log("  SKIP adoption: fewer than three eligible runs per terminal");
    } else {
      check("adoption median tokens", median(cloudterm.map((run) => run.tokens)), Math.min(...eligible.map(([, runs]) => median(runs.map((run) => run.tokens))!)), "<=");
    }
  }
  return passed ? 0 : 1;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  process.exit(runAxGate(join(root, "src/lib/ax-results.json"), join(root, "package.json"), join(root, "src/lib/adopt-results.json")));
}
