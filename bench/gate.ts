import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasCurrentCloudtermVersion } from "./ax-gate";

export const hasCurrentPerfBenchmarkVersion = hasCurrentCloudtermVersion;

type Timing = {
    medianMs: number | null;
    cpuMs?: { medianMs: number | null };
};
type Row = {
    id: string;
    timings: Record<string, Timing>;
    mountMs: number;
    textInDom: boolean;
    unverifiedTiming: string | null;
};
const tieMs = 17;

export function runPerfGate(resultsPath: string, packagePath: string, args: string[] = process.argv.slice(2)): number {
    const metricIndex = args.indexOf("--metric");
    const metric = metricIndex === -1 ? "wall" : args[metricIndex + 1];
    if (metric !== "wall" && metric !== "cpuMs") {
        console.log(`gate: unsupported metric ${metric ?? ""}`);
        return 2;
    }
    if (!hasCurrentPerfBenchmarkVersion(resultsPath, packagePath)) {
        console.log("gate: stale or missing cloudterm benchmark results");
        return 2;
    }
    const subject = args.find((arg, index) => index !== metricIndex && index !== metricIndex + 1 && !arg.startsWith("--")) ?? "cloudterm";
    const ownFamily = (id: string) => id === "cloudterm" || id.startsWith("cloudterm-");
    const results = JSON.parse(readFileSync(resultsPath, "utf8")) as {
        generatedAt: string;
        terminals: Row[];
    };
    const me = results.terminals.find((t) => t.id === subject);
    if (!me) {
        console.log(`gate: no row for ${subject}`);
        return 2;
    }
    const rivals = results.terminals.filter((t) => !ownFamily(t.id) && !t.unverifiedTiming);
    const metrics: Array<[string, (t: Row) => number | null]> = [
        ...Object.keys(me.timings).map((w) => [w, (t: Row) => metric === "cpuMs" ? t.timings[w]?.cpuMs?.medianMs ?? null : t.timings[w]?.medianMs ?? null] as [string, (t: Row) => number | null]),
        ["mount", (t: Row) => t.mountMs],
    ];
    let ok = me.textInDom;
    console.log(`gate ${subject} ${metric} @ ${results.generatedAt} (tie band ${tieMs} ms, ${rivals.length} verified rivals)`);
    if (!me.textInDom) console.log("  FAIL textInDom=false");
    for (const [name, pick] of metrics) {
        const mine = pick(me);
        const best = rivals.map((t) => ({ id: t.id, v: pick(t) })).filter((x): x is { id: string; v: number } => x.v != null).sort((a, b) => a.v - b.v)[0]!;
        const pass = mine != null && mine <= best.v + tieMs;
        ok &&= pass;
        const rounded = (value: number | null) => value == null ? "n/a" : value.toFixed(1);
        console.log(`  ${pass ? "PASS" : "FAIL"} ${name.padEnd(13)} ${rounded(mine).padStart(5)} ms vs best ${best.id} ${rounded(best.v)} ms (gap ${mine == null ? "n/a" : (mine - best.v).toFixed(1)})`);
    }
    return ok ? 0 : 1;
}

if (import.meta.main) {
    const root = join(import.meta.dir, "..");
    process.exit(runPerfGate(join(root, "src/lib/bench-results.json"), join(root, "package.json")));
}
