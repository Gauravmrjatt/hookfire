import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Plus, Send, X } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Pagination, RelativeTime, SearchInput } from "@/components/common/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeliveryDetail } from "@/features/deliveries/delivery-detail";
import { useDebouncedValue } from "@/hooks/use-debounced";
import { useDeliveries, useEndpoints } from "@/hooks/queries";
import { prettyUrl } from "@/lib/format";
import { openSendEventDialog } from "@/lib/ui-events";
import { STATUS_ORDER, statusMeta } from "@/lib/status";

const PAGE_SIZE = 25;

export function DeliveriesPage() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [endpointId, setEndpointId] = useState(params.get("endpoint_id") ?? "all");
  const [eventId, setEventId] = useState(params.get("event_id") ?? "");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const debounced = useDebouncedValue(search, 300);
  const endpoints = useEndpoints();

  const statusList = useMemo(() => {
    if (status === "all") return undefined;
    if (status === "in_flight") return ["pending", "processing", "retrying"];
    return [status];
  }, [status]);

  const deliveries = useDeliveries({
    limit: PAGE_SIZE,
    offset,
    q: debounced || undefined,
    status: statusList,
    endpoint_id: endpointId === "all" ? undefined : endpointId,
    event_id: eventId || undefined,
  });

  // Keep deep links in sync with the visible filters.
  useEffect(() => {
    const next = new URLSearchParams();
    if (status !== "all") next.set("status", status);
    if (endpointId !== "all") next.set("endpoint_id", endpointId);
    if (eventId) next.set("event_id", eventId);
    setParams(next, { replace: true });
  }, [status, endpointId, eventId, setParams]);

  const hasFilters =
    status !== "all" || endpointId !== "all" || eventId !== "" || debounced.length > 0;

  return (
    <>
      <PageHeader
        title="Deliveries"
        description="One row per event × endpoint. Retry schedules are durable: a delivery in Retrying has a persisted next attempt time, not an in-memory timer."
        actions={
          <Button onClick={openSendEventDialog}>
            <Plus aria-hidden="true" />
            Send event
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <Tabs
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setOffset(0);
              }}
            >
              <TabsList aria-label="Filter deliveries by status" className="flex-nowrap">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="in_flight">In flight</TabsTrigger>
                {STATUS_ORDER.map((value) => (
                  <TabsTrigger key={value} value={value}>
                    {statusMeta(value).label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

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

        {eventId ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-raised/[0.35] px-4 py-2">
            <span className="text-2xs text-fg-muted">Filtered to event</span>
            <code className="min-w-0 truncate font-mono text-2xs text-fg-subtle">
              {eventId}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setEventId("");
                setOffset(0);
              }}
            >
              <X aria-hidden="true" />
              Clear event filter
            </Button>
          </div>
        ) : null}

        {deliveries.isLoading ? (
          <LoadingState rows={8} cols={6} />
        ) : deliveries.error ? (
          <ErrorState error={deliveries.error} onRetry={() => deliveries.refetch()} />
        ) : deliveries.data && deliveries.data.items.length === 0 ? (
          <EmptyState
            icon={Send}
            title={hasFilters ? "No deliveries match these filters" : "No deliveries yet"}
            description={
              hasFilters
                ? "Try a different status, endpoint, or search term. Filters apply to the server-side query."
                : "Deliveries are created in the same transaction as the event, one per active endpoint."
            }
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatus("all");
                    setEndpointId("all");
                    setEventId("");
                    setSearch("");
                    setOffset(0);
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={openSendEventDialog}>
                  <Plus aria-hidden="true" />
                  Send an event
                </Button>
              )
            }
          />
        ) : (
          <>
            <TableWrap label="Deliveries">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Created</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="hidden lg:table-cell">Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Attempts</TableHead>
                    <TableHead className="hidden md:table-cell">Next attempt</TableHead>
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
                      <TableCell className="max-w-[240px]">
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
                      <TableCell className="hidden max-w-[220px] lg:table-cell">
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
                      <TableCell className="hidden whitespace-nowrap md:table-cell">
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
                          onClick={() => setSelected(delivery.id)}
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

      <p className="text-[10px] text-fg-muted">
        Duplicates are possible by design (at-least-once). Subscribers should
        deduplicate on <code className="font-mono">X-Webhook-ID</code>.
      </p>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent aria-describedby={undefined}>
          <DialogTitle className="mb-6 text-sm font-semibold text-fg">
            Delivery detail
          </DialogTitle>
          {selected ? <DeliveryDetail id={selected} /> : null}
        </SheetContent>
      </Dialog>
    </>
  );
}
