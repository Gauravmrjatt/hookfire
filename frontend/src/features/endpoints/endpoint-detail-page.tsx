import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, KeyRound, Power, ShieldCheck } from "lucide-react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
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
import { useDeleteEndpoint, useDeliveries, useEndpoint } from "@/hooks/queries";
import { formatAbsolute, formatShort } from "@/lib/format";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 last:border-0">
      <dt className="text-2xs text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-xs text-fg">{children}</dd>
    </div>
  );
}

export function EndpointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const endpoint = useEndpoint(id);
  const deliveries = useDeliveries({ endpoint_id: id, limit: 10 });
  const remove = useDeleteEndpoint();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  if (endpoint.isLoading) {
    return (
      <Card>
        <LoadingState rows={6} cols={2} />
      </Card>
    );
  }
  if (endpoint.error || !endpoint.data) {
    return (
      <Card>
        <ErrorState error={endpoint.error} onRetry={() => endpoint.refetch()} />
      </Card>
    );
  }

  const ep = endpoint.data;

  return (
    <>
      <div className="flex flex-col gap-4">
        <Link
          to="/endpoints"
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-xs text-2xs text-fg-muted transition-colors duration-[120ms] hover:text-fg"
        >
          <ArrowLeft aria-hidden="true" className="size-[13px]" />
          Endpoints
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-8">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-md font-semibold tracking-[-0.02em] text-fg">
                {ep.name}
              </h1>
              <Badge tone={ep.active ? "success" : "neutral"}>
                {ep.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <code className="max-w-[520px] truncate font-mono text-2xs text-fg-muted">
                {ep.url}
              </code>
              <CopyButton value={ep.url} label="Copy endpoint URL" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/deliveries?endpoint_id=${ep.id}`}>
                View all deliveries
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            {ep.active ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmOpen(true)}
              >
                <Power aria-hidden="true" />
                Deactivate
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card className="p-8">
            <h2 className="mb-2 text-xs font-semibold text-fg">Configuration</h2>
            <dl className="flex flex-col">
              <DetailRow label="Endpoint id">
                <span className="font-mono text-2xs text-fg-subtle">{ep.id}</span>
              </DetailRow>
              <DetailRow label="Rate limit">
                {ep.rate_limit === 0
                  ? "Engine default (100/s)"
                  : `${ep.rate_limit} deliveries per second`}
              </DetailRow>
              <DetailRow label="Created">
                <span title={formatAbsolute(ep.created_at)}>
                  {formatShort(ep.created_at)}
                </span>
              </DetailRow>
              <DetailRow label="Updated">
                <span title={formatAbsolute(ep.updated_at)}>
                  {formatShort(ep.updated_at)}
                </span>
              </DetailRow>
            </dl>
          </Card>

          <Card className="p-8">
            <div className="mb-2 flex items-center gap-2">
              <KeyRound aria-hidden="true" className="size-[14px] text-fg-muted" />
              <h2 className="text-xs font-semibold text-fg">Signing</h2>
            </div>
            <p className="text-2xs leading-[18px] text-fg-muted">
              The engine signs every request with{" "}
              <code className="font-mono text-fg-subtle">HMAC-SHA256(secret, timestamp + "." + body)</code>{" "}
              and sends it as{" "}
              <code className="font-mono text-fg-subtle">X-Webhook-Signature</code>.
            </p>
            <div className="mt-4 flex items-start gap-2 rounded-xs border border-line bg-surface p-3">
              <ShieldCheck aria-hidden="true" className="mt-[2px] size-[13px] shrink-0 text-fg-muted" />
              <p className="text-2xs leading-[18px] text-fg-muted">
                The secret is shown only once, when the endpoint is created.
                Rotate it by registering a new endpoint and retiring this one.
              </p>
            </div>
          </Card>
        </div>

        <Card className="min-w-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xs font-semibold text-fg">Recent deliveries</h2>
              <p className="text-2xs text-fg-muted">
                The ten most recent attempts for this endpoint.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/deliveries?endpoint_id=${ep.id}`}>View all</Link>
            </Button>
          </div>

          {deliveries.isLoading ? (
            <LoadingState rows={6} cols={4} />
          ) : deliveries.error ? (
            <ErrorState error={deliveries.error} onRetry={() => deliveries.refetch()} />
          ) : (deliveries.data?.items.length ?? 0) === 0 ? (
            <p className="p-8 text-2xs text-fg-muted">
              No deliveries yet. Send an event to fan out to this endpoint.
            </p>
          ) : (
            <TableWrap label="Recent deliveries">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Attempts</TableHead>
                    <TableHead className="hidden md:table-cell">Updated</TableHead>
                    <TableHead className="w-[64px] text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.data?.items.map((delivery) => (
                    <TableRow key={delivery.id}>
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Deactivate ${ep.name}?`}
        description="No new deliveries will fan out to this endpoint. In-flight retries may still complete, and history is preserved."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          await remove.mutateAsync(ep.id);
          navigate("/endpoints", { replace: true });
        }}
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
