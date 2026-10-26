import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { finishedAssistantUsage } from "./transcript-usage";

const usage = (tokens: number, cost: number) => ({ role: "assistant", usage: { totalTokens: tokens, cost: { total: cost } } });

test("each assistant turn is counted once, not once per event that repeats it", () => {
  const transcript = [
    { type: "message_update", message: usage(500, 9) },
    { type: "message_end", message: usage(1200, 0.01) },
    { type: "turn_end", message: usage(1200, 0.01) },
    { type: "agent_end", messages: [usage(1200, 0.01)] },
    { type: "message_end", message: { role: "user", usage: { totalTokens: 7 } } },
    { type: "message_end", message: usage(800, 0.005) },
  ].map((event) => JSON.stringify(event)).join("\n") + "\nnot json\n";
  const { totals, costs } = finishedAssistantUsage(transcript);
  expect(totals).toEqual([1200, 800]);
  expect(costs).toEqual([0.01, 0.005]);
});

test("a saved cloudterm transcript gives one third of the old regex sum", () => {
  const dir = join(import.meta.dir, ".out", "adopt", "cloudterm-0");
  let transcript: string;
  try { transcript = readFileSync(join(dir, ".agent-transcript.jsonl"), "utf8"); } catch { return; }
  const old = [...transcript.matchAll(/"totalTokens":(\d+)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
  const fixed = finishedAssistantUsage(transcript).totals.reduce((a, b) => a + b, 0);
  expect(fixed * 3).toBe(old);
});
