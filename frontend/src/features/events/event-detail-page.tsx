import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { JsonViewer } from "@/components/common/json-viewer";
import { ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { CopyButton, RelativeTime } from "@/components/common/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { DeliveryDetail } from "@/features/deliveries/delivery-detail";
import { useEvent, useEventDeliveries } from "@/hooks/queries";
import { formatAbsolute, formatShort, formatTime } from "@/lib/format";

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const event = useEvent(id);
  const history = useEventDeliveries(id);
  const [selected, setSelected] = useState<string | null>(null);

  if (event.isLoading) {
    return (
      <Card>
        <LoadingState rows={6} cols={3} />
      </Card>
    );
  }

  if (event.error || !event.data) {
    return (
      <Card>
        <ErrorState error={event.error} onRetry={() => event.refetch()} />
      </Card>
    );
  }

  const deliveries = history.data?.deliveries ?? [];
  const delivered = deliveries.filter((d) => d.status === "delivered").length;
  const inFlight = deliveries.filter((d) =>
    ["pending", "processing", "retrying"].includes(d.status),
  ).length;
  const deadLetter = deliveries.filter((d) => d.status === "dead_letter").length;

  return (
    <>
      <div className="flex flex-col gap-4">
        <Link
          to="/events"
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-xs text-2xs text-fg-muted transition-colors duration-[120ms] hover:text-fg"
        >
          <ArrowLeft aria-hidden="true" className="size-[13px]" />
          Events
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-8">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-md font-semibold tracking-[-0.02em] text-fg">
                {event.data.event_type}
              </h1>
              <Badge tone={deadLetter > 0 ? "danger" : inFlight > 0 ? "info" : "success"}>
                {deadLetter > 0
                  ? `${deadLetter} dead letter`
                  : inFlight > 0
                    ? `${inFlight} in flight`
                    : "All delivered"}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-2xs text-fg-muted">{event.data.id}</span>
              <CopyButton value={event.data.id} label="Copy event id" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/deliveries?event_id=${event.data.id}`}>
                View deliveries
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <JsonViewer value={event.data.payload} label="Event payload" collapsedHeight={280} />

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line p-4">
              <h2 className="text-xs font-semibold text-fg">Deliveries</h2>
              <span className="text-2xs text-fg-muted">
                {delivered}/{deliveries.length} delivered
              </span>
            </div>

            {history.isLoading ? (
              <LoadingState rows={4} cols={4} />
            ) : history.error ? (
              <ErrorState error={history.error} onRetry={() => history.refetch()} />
            ) : deliveries.length === 0 ? (
              <p className="p-4 text-2xs text-fg-muted">
                No active endpoints existed when this event was accepted, so
                there is nothing to deliver. Register an endpoint and send a new
                event.
              </p>
            ) : (
              <TableWrap label="Deliveries for this event">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Attempts</TableHead>
                      <TableHead className="hidden md:table-cell">Updated</TableHead>
                      <TableHead className="w-[64px] text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="max-w-[200px]">
                          <Link
                            to={`/endpoints/${delivery.endpoint_id}`}
                            className="focus-ring block truncate rounded-xs font-mono text-2xs text-fg-subtle hover:text-fg"
                          >
                            {delivery.endpoint_id}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={delivery.status} />
                        </TableCell>
                        <TableCell className="hidden text-fg-muted sm:table-cell">
                          {delivery.attempt_count}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <RelativeTime iso={delivery.updated_at} />
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
            )}
          </Card>
        </div>

        <Card className="h-fit p-8">
          <h2 className="mb-4 text-xs font-semibold text-fg">Event metadata</h2>
          <dl className="flex flex-col gap-4 text-2xs">
            <div className="flex flex-col gap-1">
              <dt className="text-fg-muted">Event id</dt>
              <dd className="break-all font-mono text-fg-subtle">{event.data.id}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-fg-muted">Received</dt>
              <dd className="text-fg">
                <span title={formatAbsolute(event.data.created_at)}>
                  {formatShort(event.data.created_at)} · {formatTime(event.data.created_at)}
                </span>
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-fg-muted">Fan-out</dt>
              <dd className="text-fg">{deliveries.length} endpoint(s)</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-fg-muted">Delivered</dt>
              <dd className="text-success">{delivered}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-fg-muted">In flight</dt>
              <dd className="text-info">{inFlight}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-fg-muted">Dead letter</dt>
              <dd className={deadLetter > 0 ? "text-danger" : "text-fg-muted"}>
                {deadLetter}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

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
