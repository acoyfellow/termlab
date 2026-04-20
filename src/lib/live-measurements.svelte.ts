/**
 * Tiny reactive store of runtime-measured benchmark results, keyed by
 * adapter id. TerminalCell writes into this as it mounts and as the
 * user fires test payloads. BenchMatrix renders the latest values.
 *
 * Svelte 5 runes — this is a plain object wrapped in $state() and
 * reactivity just works through getters/setters.
 */

import type { BenchResult } from './benchmark';

export type Measurement = { value: string; result: BenchResult };
export type LiveMap = Record<string, Record<string, Measurement>>;

// Shared writable state. Components import the same module, so the
// reference is shared; $state makes the object reactive.
const live: LiveMap = $state({});

export function liveMeasurements(): LiveMap {
  return live;
}

export function record(adapterId: string, rowKey: string, m: Measurement) {
  // Initialize the per-adapter bucket if missing. Using the mutation
  // directly works with Svelte 5's proxy-based reactivity.
  if (!live[adapterId]) live[adapterId] = {};
  live[adapterId][rowKey] = m;
}
