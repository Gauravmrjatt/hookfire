import { useState } from "react";
import {
  Activity,
  ExternalLink,
  Gauge,
  Inbox,
  Timer,
  Users,
} from "lucide-react";

import { LiveChart } from "@/components/common/live-chart";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { CopyButton } from "@/components/common/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { useStats } from "@/hooks/queries";
import { deriveDeltas, useStatsHistory } from "@/hooks/use-stats-history";
import { formatMs, formatNumber, formatPercent } from "@/lib/format";

const METRICS = [
  {
    name: "webhook_events_total",
    type: "counter",
    labels: "outcome",
    question: "How many events were accepted vs replayed?",
  },
  {
    name: "webhook_deliveries_total",
    type: "counter",
    labels: "status",
    question: "What is the terminal outcome mix?",
  },
  {
    name: "webhook_delivery_failures_total",
    type: "counter",
    labels: "endpoint_id",
    question: "Which subscriber is failing?",
  },
  {
    name: "webhook_delivery_retries_total",
    type: "counter",
    labels: "endpoint_id",
    question: "How much retry pressure is there?",
  },
  {
    name: "webhook_delivery_latency_seconds",
    type: "histogram",
    labels: "endpoint_id",
    question: "What is p50/p95/p99 delivery latency?",
  },
  {
    name: "webhook_queue_depth",
    type: "gauge",
    labels: "—",
    question: "Is the backlog growing faster than workers drain it?",
  },
  {
    name: "webhook_dead_letter_total",
    type: "counter",
    labels: "—",
    question: "How often do deliveries exhaust retries?",
  },
  {
    name: "webhook_active_workers",
    type: "gauge",
    labels: "—",
    question: "How many workers are actually busy?",
  },
] as const;

const SCRAPE_CONFIG = `scrape_configs:
  - job_name: hookfire
    metrics_path: /metrics
    static_configs:
      - targets: ["hookfire:8080"]`;

export function MetricsPage() {
  const [live, setLive] = useState(true);
  const stats = useStats(live ? 5_000 : false);
  const history = useStatsHistory(stats.data);
  const deltas = deriveDeltas(history);

  const throughput = deltas.map((d) => d.throughput);
  const queue = deltas.map((d) => d.queueDepth);
  const p99 = deltas.map((d) => d.p99);
  const success = deltas.map((d) => d.successRate * 100);

  return (
    <>
      <PageHeader
        title="Metrics"
        description="Runtime health from the engine's instrumentation. Charts are a session-local window built from /v1/stats polling — Prometheus remains the source of truth for history and alerting."
        actions={
          <>
            <div className="flex h-[32px] items-center gap-3 rounded-xs border border-line bg-surface-raised/40 px-3">
              <label htmlFor="metrics-live" className="text-2xs text-fg-muted">
                Live
              </label>
              <Switch
                id="metrics-live"
                checked={live}
                onCheckedChange={setLive}
                aria-label="Toggle live refresh"
              />
            </div>
            <Button variant="outline" asChild>
              <a href="/metrics" target="_blank" rel="noreferrer">
                Open /metrics
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Deliveries attempted"
          value={formatNumber(stats.data?.deliveries_total ?? 0)}
          hint={`${stats.data?.deliveries_successful ?? 0} successful`}
          icon={Activity}
          series={throughput}
        />
        <StatCard
          label="Success rate"
          value={formatPercent(stats.data?.success_rate ?? 0)}
          hint="delivered ÷ terminal outcomes"
          icon={Gauge}
          tone={(stats.data?.success_rate ?? 1) >= 0.95 ? "success" : "warning"}
        />
        <StatCard
          label="Queue depth"
          value={formatNumber(stats.data?.queue_depth ?? 0)}
          hint={`${stats.data?.active_workers ?? 0} workers active`}
          icon={Users}
          series={queue}
        />
        <StatCard
          label="Dead letters"
          value={formatNumber(stats.data?.dead_letter_count ?? 0)}
          hint="replayable, event id preserved"
          icon={Inbox}
          tone={(stats.data?.dead_letter_count ?? 0) > 0 ? "danger" : "success"}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-8">
          <LiveChart
            data={throughput}
            label="Delivery throughput (per second)"
            format={(value) => `${value.toFixed(1)}/s`}
            tone="info"
            emptyHint="Waiting for two samples…"
          />
        </Card>
        <Card className="p-8">
          <LiveChart
            data={queue}
            label="Queue depth (due + scheduled)"
            format={(value) => formatNumber(value)}
            tone="warning"
            emptyHint="Waiting for two samples…"
          />
        </Card>
        <Card className="p-8">
          <LiveChart
            data={p99}
            label="p99 delivery latency"
            format={(value) => formatMs(value)}
            tone="success"
            emptyHint="Waiting for two samples…"
          />
        </Card>
        <Card className="p-8">
          <LiveChart
            data={success}
            label="Success rate (%)"
            format={(value) => `${value.toFixed(1)}%`}
            tone="danger"
            emptyHint="Waiting for two samples…"
          />
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xs font-semibold text-fg">Prometheus instruments</h2>
            <p className="text-2xs text-fg-muted">
              Low-cardinality labels only — never event ids, URLs, or payloads.
            </p>
          </div>
          <Badge tone="info">8 instruments</Badge>
        </div>
        <TableWrap label="Prometheus metric reference">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Labels</TableHead>
                <TableHead>Answers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRICS.map((metric) => (
                <TableRow key={metric.name}>
                  <TableCell className="font-mono text-2xs text-fg">{metric.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge tone="neutral">{metric.type}</Badge>
                  </TableCell>
                  <TableCell className="hidden font-mono text-2xs text-fg-muted md:table-cell">
                    {metric.labels}
                  </TableCell>
                  <TableCell className="text-2xs text-fg-muted">{metric.question}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      </Card>

      <Card className="p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xs font-semibold text-fg">Scrape configuration</h2>
            <p className="text-2xs text-fg-muted">
              Point Prometheus at the engine. The endpoint is public by default —
              restrict it at the network layer in production.
            </p>
          </div>
          <CopyButton value={SCRAPE_CONFIG} label="Copy scrape config" />
        </div>
        <pre className="mt-4 overflow-x-auto rounded-xs border border-line bg-surface p-4 font-mono text-2xs leading-[18px] text-fg-subtle">
          <code>{SCRAPE_CONFIG}</code>
        </pre>
      </Card>

      <p className="flex items-center gap-2 text-[10px] text-fg-muted">
        <Timer aria-hidden="true" className="size-[12px]" />
        Latency samples come from a fixed 10,000-entry ring in the engine, so p99
        is recent-window, not all-time.
      </p>
    </>
  );
}
