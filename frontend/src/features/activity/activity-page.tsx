import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  Inbox,
  Layers,
  Plus,
  Radio,
  Timer,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import {
  Pagination,
  RelativeTime,
  SearchInput,
} from "@/components/common/utils";
import { DeliveryDetail } from "@/features/deliveries/delivery-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced";
import { useDeliveries, useEndpoints, useStats } from "@/hooks/queries";
import { deriveDeltas, useStatsHistory } from "@/hooks/use-stats-history";
import { formatMs, formatNumber, formatPercent, prettyUrl } from "@/lib/format";
import { openSendEventDialog } from "@/lib/ui-events";
import type { DeliveryStatus } from "@/types/api";

const PAGE_SIZE = 25;

type StatusFilter = "all" | "in_flight" | DeliveryStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_flight", label: "In flight" },
  { value: "delivered", label: "Delivered" },
  { value: "retrying", label: "Retrying" },
  { value: "dead_letter", label: "Dead letter" },
];

function statusParam(filter: StatusFilter): string[] | undefined {
  if (filter === "all") return undefined;
  if (filter === "in_flight") return ["pending", "processing", "retrying"];
  return [filter];
}

export function ActivityPage() {
  const [live, setLive] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [endpointId, setEndpointId] = useState("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const stats = useStats(live ? 5_000 : false);
  const history = useStatsHistory(stats.data);
  const deltas = deriveDeltas(history);
  const endpoints = useEndpoints();

  const deliveries = useDeliveries({
    limit: PAGE_SIZE,
    offset,
    q: debouncedSearch || undefined,
    status: statusParam(statusFilter),
    endpoint_id: endpointId === "all" ? undefined : endpointId,
  });

  const hasFilters =
    statusFilter !== "all" || endpointId !== "all" || debouncedSearch.length > 0;
  const throughput = deltas.map((d) => d.throughput);
  const queueSeries = deltas.map((d) => d.queueDepth);
  const latencySeries = deltas.map((d) => d.p99);

  function resetFilters() {
    setStatusFilter("all");
    setEndpointId("all");
    setSearch("");
    setOffset(0);
  }

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every delivery the engine has attempted, newest first. Filters are server-side; the feed refreshes every five seconds while live."
        actions={
          <>
            <div className="flex h-[32px] items-center gap-3 rounded-xs border border-line bg-surface-raised/40 px-3">
              <label htmlFor="live-toggle" className="text-2xs text-fg-muted">
                Live
              </label>
              <Switch
                id="live-toggle"
                checked={live}
                onCheckedChange={setLive}
                aria-label="Toggle live refresh"
              />
              <span className="text-[10px] text-fg-muted">5s</span>
            </div>
            <Button variant="outline" onClick={() => void deliveries.refetch()}>
              Refresh
            </Button>
            <Button variant="primary" onClick={openSendEventDialog}>
              <Plus aria-hidden="true" />
              Send event
            </Button>
          </>
        }
      />

      <section aria-label="Delivery health" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Deliveries"
          value={formatNumber(stats.data?.deliveries_total ?? 0)}
          hint={
            stats.data
              ? `${formatPercent(stats.data.success_rate)} success · ${stats.data.deliveries_failed} failed`
              : "Waiting for the engine"
          }
          icon={Layers}
          series={throughput}
          tone={(stats.data?.success_rate ?? 1) < 0.95 ? "warning" : "neutral"}
        />
        <StatCard
          label="Queue depth"
          value={formatNumber(stats.data?.queue_depth ?? 0)}
          hint={`${stats.data?.active_workers ?? 0} active workers`}
          icon={Users}
          series={queueSeries}
          tone={(stats.data?.queue_depth ?? 0) > 500 ? "warning" : "neutral"}
        />
        <StatCard
          label="p99 latency"
          value={formatMs(stats.data?.p99_latency_ms)}
          hint={`average ${formatMs(stats.data?.average_latency_ms)}`}
          icon={Timer}
          series={latencySeries}
        />
        <StatCard
          label="Dead letters"
          value={formatNumber(stats.data?.dead_letter_count ?? 0)}
          hint={
            (stats.data?.dead_letter_count ?? 0) > 0
              ? "Replay from the dead-letter queue"
              : "Nothing needs attention"
          }
          icon={Inbox}
          tone={(stats.data?.dead_letter_count ?? 0) > 0 ? "danger" : "success"}
        />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center xl:justify-between">
          <Tabs
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as StatusFilter);
              setOffset(0);
            }}
          >
            <TabsList aria-label="Filter by delivery status">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="w-full sm:w-[190px]">
              <Select
                value={endpointId}
                onChange={(event) => {
                  setEndpointId(event.target.value);
                  setOffset(0);
                }}
                aria-label="Filter by endpoint"
              >
                <option value="all">All endpoints</option>
                {endpoints.data?.map((endpoint) => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.name}
                  </option>
                ))}
              </Select>
            </div>
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value);
                setOffset(0);
              }}
              placeholder="Search delivery or event type"
              label="Search deliveries"
            />
          </div>
        </div>

        {deliveries.isLoading ? (
          <LoadingState rows={8} cols={6} />
        ) : deliveries.error ? (
          <ErrorState error={deliveries.error} onRetry={() => deliveries.refetch()} />
        ) : deliveries.data && deliveries.data.items.length === 0 ? (
          <EmptyState
            icon={hasFilters ? Radio : Activity}
            title={hasFilters ? "No deliveries match these filters" : "No deliveries yet"}
            description={
              hasFilters
                ? "Clear the filters to see the full feed. Delivery rows are created for each active endpoint when an event is accepted."
                : "Send an event and the engine will fan it out to every active endpoint. Each attempt is recorded here with its status and timing."
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={openSendEventDialog}>
                  <Plus aria-hidden="true" />
                  Send your first event
                </Button>
              )
            }
          />
        ) : (
          <>
            <TableWrap label="Delivery activity">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="hidden md:table-cell">Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Attempts</TableHead>
                    <TableHead className="hidden lg:table-cell">Next attempt</TableHead>
                    <TableHead className="w-[64px] text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.data?.items.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="whitespace-nowrap">
                        <RelativeTime iso={delivery.created_at} />
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <Link
                          to={`/events/${delivery.event_id}`}
                          className="focus-ring block truncate rounded-xs font-medium text-fg hover:text-accent-ink"
                        >
                          {delivery.event_type}
                        </Link>
                        <span className="mt-1 block truncate font-mono text-[10px] text-fg-muted">
                          {delivery.id}
                        </span>
                      </TableCell>
                      <TableCell className="hidden max-w-[240px] md:table-cell">
                        <Link
                          to={`/endpoints/${delivery.endpoint_id}`}
                          className="focus-ring block truncate rounded-xs text-fg-subtle hover:text-fg"
                          title={delivery.endpoint_url}
                        >
                          {delivery.endpoint_name}
                        </Link>
                        <span className="mt-1 block truncate font-mono text-[10px] text-fg-muted">
                          {prettyUrl(delivery.endpoint_url)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={delivery.status} />
                      </TableCell>
                      <TableCell className="hidden text-fg-muted sm:table-cell">
                        {delivery.attempt_count === 0 ? "—" : delivery.attempt_count}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell">
                        {delivery.next_attempt_at ? (
                          <RelativeTime iso={delivery.next_attempt_at} />
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setSelectedDelivery(delivery.id)}
                          aria-label={`Inspect delivery ${delivery.id}`}
                        >
                          <ArrowUpRight aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
            <Pagination
              total={deliveries.data?.total ?? 0}
              limit={PAGE_SIZE}
              offset={offset}
              onChange={setOffset}
              unit="deliveries"
            />
          </>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-fg-muted">
        <Badge tone={live ? "success" : "neutral"} className="gap-[6px]">
          <span
            aria-hidden="true"
            className={
              live
                ? "size-[6px] rounded-full bg-success animate-[hf-pulse_1.8s_ease-in-out_infinite]"
                : "size-[6px] rounded-full bg-fg-muted"
            }
          />
          {live ? "Live" : "Paused"}
        </Badge>
        <span>
          {live
            ? `Polling every 5s · ${history.length} session samples`
            : "Live refresh is paused; use Refresh to fetch the latest page."}
        </span>
        <span className="ml-auto">
          Updated{" "}
          {stats.dataUpdatedAt ? (
            <RelativeTime iso={new Date(stats.dataUpdatedAt).toISOString()} className="inline" />
          ) : (
            "—"
          )}
        </span>
      </div>

      <Dialog
        open={Boolean(selectedDelivery)}
        onOpenChange={(open) => {
          if (!open) setSelectedDelivery(null);
        }}
      >
        <SheetContent aria-describedby={undefined}>
          <DialogTitle className="mb-6 text-sm font-semibold text-fg">
            Delivery detail
          </DialogTitle>
          {selectedDelivery ? <DeliveryDetail id={selectedDelivery} /> : null}
        </SheetContent>
      </Dialog>
    </>
  );
}
