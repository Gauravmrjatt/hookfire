import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Inbox, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Pagination, RelativeTime } from "@/components/common/utils";
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
import { useDeadLetter, useReplayDelivery, useStats } from "@/hooks/queries";
import { openSendEventDialog } from "@/lib/ui-events";

const PAGE_SIZE = 25;

export function DeadLetterPage() {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const dlq = useDeadLetter(PAGE_SIZE, offset);
  const stats = useStats(10_000);
  const replay = useReplayDelivery();

  const items = dlq.data?.items ?? [];

  async function replayAll() {
    let ok = 0;
    for (const item of items) {
      try {
        await replay.mutateAsync(item.id);
        ok += 1;
      } catch {
        // Individual failures already surface a toast; keep draining the rest.
      }
    }
    if (ok === items.length) {
      toast.success(`Replayed ${ok} deliveries`, {
        description: "Each kept its original event id.",
      });
    }
    setOffset(0);
  }

  return (
    <>
      <PageHeader
        title="Dead letter"
        description="Terminal failures: a permanent 4xx or retries exhausted. Replay resets the row to pending without creating a new event, so subscribers can deduplicate on the original id."
        actions={
          <>
            <Button variant="outline" onClick={() => void dlq.refetch()}>
              Refresh
            </Button>
            <Button
              variant="outline"
              disabled={items.length === 0 || replay.isPending}
              onClick={() => setConfirmAll(true)}
            >
              <RotateCcw aria-hidden="true" />
              Replay page
            </Button>
            <Button variant="primary" onClick={openSendEventDialog}>Send event</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xs border border-line bg-surface-raised/[0.35] p-8">
          <p className="text-2xs text-fg-muted">In dead letter</p>
          <p className="mt-1 text-md font-semibold tracking-[-0.02em] text-danger">
            {stats.data?.dead_letter_count ?? items.length}
          </p>
        </div>
        <div className="rounded-xs border border-line bg-surface-raised/[0.35] p-8">
          <p className="text-2xs text-fg-muted">On this page</p>
          <p className="mt-1 text-md font-semibold tracking-[-0.02em] text-fg">
            {items.length}
          </p>
        </div>
        <div className="rounded-xs border border-line bg-surface-raised/[0.35] p-8">
          <p className="text-2xs text-fg-muted">Replay semantics</p>
          <p className="mt-1 text-xs text-fg">Same event id, new attempt</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        {dlq.isLoading ? (
          <LoadingState rows={6} cols={5} />
        ) : dlq.error ? (
          <ErrorState error={dlq.error} onRetry={() => dlq.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Dead letter queue is empty"
            description="Nothing has exhausted its retries or hit a permanent 4xx. Failures will appear here with their last error and attempt count."
            action={
              <Button variant="outline" size="sm" onClick={() => void dlq.refetch()}>
                Refresh queue
              </Button>
            }
          />
        ) : (
          <>
            <TableWrap label="Dead letter queue">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Failed</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="hidden md:table-cell">Endpoint</TableHead>
                    <TableHead>Last error</TableHead>
                    <TableHead className="hidden sm:table-cell">Attempts</TableHead>
                    <TableHead className="w-[140px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="whitespace-nowrap">
                        <RelativeTime iso={delivery.updated_at} />
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <Link
                          to={`/events/${delivery.event_id}`}
                          className="focus-ring block truncate rounded-xs font-mono text-2xs text-fg-subtle hover:text-fg"
                        >
                          {delivery.event_id}
                        </Link>
                        <span className="mt-1 block truncate font-mono text-[10px] text-fg-muted">
                          {delivery.id}
                        </span>
                      </TableCell>
                      <TableCell className="hidden max-w-[180px] md:table-cell">
                        <Link
                          to={`/endpoints/${delivery.endpoint_id}`}
                          className="focus-ring block truncate rounded-xs text-fg-subtle hover:text-fg"
                        >
                          {delivery.endpoint_id}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <span className="block truncate font-mono text-[10px] text-danger">
                          {delivery.last_error ?? "terminal failure"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <StatusBadge status={delivery.status} />
                        <span className="ml-2 text-2xs text-fg-muted">
                          {delivery.attempt_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setSelected(delivery.id)}
                            aria-label={`Inspect delivery ${delivery.id}`}
                          >
                            <ArrowUpRight aria-hidden="true" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            loading={replay.isPending && replay.variables === delivery.id}
                            onClick={() => replay.mutate(delivery.id)}
                          >
                            <RotateCcw aria-hidden="true" />
                            Replay
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
            <Pagination
              total={Math.max(stats.data?.dead_letter_count ?? 0, offset + items.length)}
              limit={PAGE_SIZE}
              offset={offset}
              onChange={setOffset}
              unit="dead letters"
            />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={`Replay ${items.length} deliveries?`}
        description="Each delivery returns to pending with its attempt count reset. The original event is reused — no duplicate event is created. Delivery may still fail if the subscriber is still unhealthy."
        confirmLabel="Replay page"
        onConfirm={replayAll}
      />

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
