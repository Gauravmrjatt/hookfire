import { useEffect, useRef, useState } from "react";

import type { Stats } from "@/types/api";

export interface StatsSample extends Stats {
  at: number;
}

/**
 * A session-local time series. The engine exposes counters, not history, so
 * the dashboard derives its own window from polled snapshots. This is labelled
 * "live session" in the UI — it is never presented as historical data.
 */
export function useStatsHistory(stats: Stats | undefined, max = 40) {
  const [samples, setSamples] = useState<StatsSample[]>([]);
  const last = useRef<Stats | undefined>(undefined);

  useEffect(() => {
    if (!stats) return;
    if (last.current === stats) return;
    last.current = stats;
    setSamples((prev) => [...prev, { ...stats, at: Date.now() }].slice(-max));
  }, [stats, max]);

  return samples;
}

export interface Delta {
  at: number;
  deliveries: number;
  throughput: number;
  queueDepth: number;
  p99: number;
  successRate: number;
}

export function deriveDeltas(samples: StatsSample[]): Delta[] {
  return samples.map((s, i) => {
    const prev = samples[i - 1];
    const seconds = prev ? Math.max((s.at - prev.at) / 1000, 0.5) : 1;
    const deliveries = prev ? Math.max(s.deliveries_total - prev.deliveries_total, 0) : 0;
    return {
      at: s.at,
      deliveries,
      throughput: deliveries / seconds,
      queueDepth: s.queue_depth,
      p99: s.p99_latency_ms,
      successRate: s.success_rate,
    };
  });
}
