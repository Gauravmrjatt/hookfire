import { Link } from "react-router-dom";
import { ArrowUpRight, RotateCcw, Timer } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { CopyButton, RelativeTime } from "@/components/common/utils";
import { ErrorState, LoadingState } from "@/components/common/states";
import { JsonViewer } from "@/components/common/json-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDelivery, useEvent, useReplayDelivery } from "@/hooks/queries";
import { formatAbsolute, formatMs, formatTime } from "@/lib/format";
import type { DeliveryAttempt } from "@/types/api";

function attemptTone(attempt: DeliveryAttempt) {
  if (attempt.status_code === undefined) return "danger" as const;
  if (attempt.status_code >= 200 && attempt.status_code < 300) return "success" as const;
  if (attempt.status_code >= 400 && attempt.status_code < 500) return "warning" as const;
  return "danger" as const;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-2xs text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-xs text-fg sm:text-right">{children}</dd>
    </div>
  );
}

export function DeliveryDetail({ id }: { id: string }) {
  const { data, isLoading, error, refetch } = useDelivery(id);
  const replay = useReplayDelivery();
  const { data: event } = useEvent(data?.delivery.event_id);

  if (isLoading) return <LoadingState rows={5} cols={2} />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const { delivery, attempts } = data;
  const canReplay = delivery.status === "dead_letter";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={delivery.status} />
        <span className="font-mono text-2xs text-fg-muted">{delivery.id}</span>
        <CopyButton value={delivery.id} label="Copy delivery id" />
        {canReplay ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            loading={replay.isPending}
            onClick={() => replay.mutate(delivery.id)}
          >
            <RotateCcw aria-hidden="true" />
            Replay delivery
          </Button>
        ) : null}
      </div>

      <dl className="flex flex-col">
        <Row label="Event">
          <Link
            to={`/events/${delivery.event_id}`}
            className="focus-ring inline-flex items-center gap-1 rounded-xs text-accent-ink hover:underline"
          >
            {event?.event_type ?? delivery.event_id}
            <ArrowUpRight aria-hidden="true" className="size-[12px]" />
          </Link>
        </Row>
        <Row label="Endpoint">
          <Link
            to={`/endpoints/${delivery.endpoint_id}`}
            className="focus-ring inline-flex items-center gap-1 rounded-xs font-mono text-2xs text-fg-subtle hover:text-fg hover:underline"
          >
            {delivery.endpoint_id}
            <ArrowUpRight aria-hidden="true" className="size-[12px]" />
          </Link>
        </Row>
        <Row label="Attempts">{delivery.attempt_count}</Row>
        <Row label="Created">
          <span title={formatAbsolute(delivery.created_at)}>{formatTime(delivery.created_at)}</span>
          <RelativeTime iso={delivery.created_at} className="ml-2" />
        </Row>
        <Row label="Last attempt">
          {delivery.last_attempt_at ? (
            <>
              <span title={formatAbsolute(delivery.last_attempt_at)}>
                {formatTime(delivery.last_attempt_at)}
              </span>
              <RelativeTime iso={delivery.last_attempt_at} className="ml-2" />
            </>
          ) : (
            <span className="text-fg-muted">Never attempted</span>
          )}
        </Row>
        {delivery.next_attempt_at ? (
          <Row label="Next attempt">
            <span className="inline-flex items-center gap-2">
              <Timer aria-hidden="true" className="size-[13px] text-warning" />
              <RelativeTime iso={delivery.next_attempt_at} />
            </span>
          </Row>
        ) : null}
        {delivery.delivered_at ? (
          <Row label="Delivered">
            <span title={formatAbsolute(delivery.delivered_at)}>
              {formatTime(delivery.delivered_at)}
            </span>
          </Row>
        ) : null}
      </dl>

      {delivery.last_error ? (
        <div className="rounded-xs border border-danger/30 bg-danger/10 p-4">
          <p className="text-2xs font-medium text-danger">Last error</p>
          <p className="mt-1 break-words font-mono text-2xs leading-[18px] text-fg">
            {delivery.last_error}
          </p>
        </div>
      ) : null}

      <section aria-labelledby="attempts-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 id="attempts-heading" className="text-xs font-semibold text-fg">
            Attempt log
          </h2>
          <span className="text-2xs text-fg-muted">{attempts.length} recorded</span>
        </div>

        {attempts.length === 0 ? (
          <p className="rounded-xs border border-line bg-surface-raised/40 p-4 text-2xs text-fg-muted">
            No attempt has been recorded yet. The dispatcher will claim this
            delivery when it is due.
          </p>
        ) : (
          <ol className="flex flex-col gap-4 border-l border-line pl-6">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="relative flex flex-col gap-1">
                <span
                  aria-hidden="true"
                  className="absolute -left-[27px] top-[6px] size-[7px] rounded-full border border-surface bg-surface-strong"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-2xs font-medium text-fg">
                    Attempt {attempt.attempt_number}
                  </span>
                  <Badge tone={attemptTone(attempt)} shape="mono">
                    {attempt.status_code ?? "network error"}
                  </Badge>
                  {attempt.response_time_ms !== undefined ? (
                    <span className="text-2xs text-fg-muted">
                      {formatMs(attempt.response_time_ms)}
                    </span>
                  ) : null}
                  <span className="ml-auto text-2xs text-fg-muted">
                    {formatTime(attempt.created_at)}
                  </span>
                </div>
                {attempt.error ? (
                  <p className="break-words font-mono text-2xs leading-[18px] text-danger">
                    {attempt.error}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {event ? <JsonViewer value={event.payload} label="Event payload" /> : null}
    </div>
  );
}
