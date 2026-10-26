export type Usage = { totals: number[]; costs: number[] };

export function finishedAssistantUsage(transcript: string): Usage {
  const totals: number[] = [];
  const costs: number[] = [];
  for (const line of transcript.split(/\r?\n/)) {
    let event: { type?: string; message?: { role?: string; usage?: { totalTokens?: number; cost?: { total?: number } } } };
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== "message_end" || event.message?.role !== "assistant") continue;
    totals.push(event.message.usage?.totalTokens ?? 0);
    costs.push(event.message.usage?.cost?.total ?? 0);
  }
  return { totals, costs };
}
