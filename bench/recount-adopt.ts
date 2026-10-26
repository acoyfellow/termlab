import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { finishedAssistantUsage } from "./transcript-usage";

const resultsPath = join(import.meta.dir, "..", "src", "lib", "adopt-results.json");
const data = JSON.parse(readFileSync(resultsPath, "utf8")) as { results: { id: string; run: number; tokens: number; costUsd: number }[] };
for (const result of data.results) {
  const transcript = readFileSync(join(import.meta.dir, ".out", "adopt", `${result.id}-${result.run}`, ".agent-transcript.jsonl"), "utf8");
  const oldSum = [...transcript.matchAll(/"totalTokens":(\d+)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
  if (oldSum !== result.tokens) throw new Error(`${result.id}-${result.run}: saved transcript (${oldSum}) is not the published run (${result.tokens})`);
  const { totals, costs } = finishedAssistantUsage(transcript);
  result.tokens = totals.reduce((a, b) => a + b, 0);
  result.costUsd = Math.round(costs.reduce((a, b) => a + b, 0) * 1000) / 1000;
}
writeFileSync(resultsPath, JSON.stringify(data, null, 2) + "\n");
console.log(data.results.map((result) => `${result.id}-${result.run}:${result.tokens}/$${result.costUsd}`).join(" "));
