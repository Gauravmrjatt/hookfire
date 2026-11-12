import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Inbox, Plus, Radio } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Pagination, RelativeTime, SearchInput } from "@/components/common/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced";
import { useEvents } from "@/hooks/queries";
import { openSendEventDialog } from "@/lib/ui-events";

const PAGE_SIZE = 25;

function FanOut({
  total,
  delivered,
  inFlight,
  deadLetter,
}: {
  total: number;
  delivered: number;
  inFlight: number;
  deadLetter: number;
}) {
  const percent = total === 0 ? 0 : Math.round((delivered / total) * 100);
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <div className="flex items-center gap-2 text-2xs">
        <span className="text-fg">
          {delivered}/{total}
        </span>
        <span className="text-fg-muted">delivered</span>
        {deadLetter > 0 ? (
          <Badge tone="danger" className="ml-auto">
            {deadLetter} DLQ
          </Badge>
        ) : inFlight > 0 ? (
          <Badge tone="info" className="ml-auto">
            {inFlight} live
          </Badge>
        ) : null}
      </div>
      <div
        className="h-[3px] w-full overflow-hidden rounded-full bg-surface-strong"
        role="img"
        aria-label={`${delivered} of ${total} deliveries completed`}
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-[200ms]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function EventsPage() {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const debounced = useDebouncedValue(search, 300);

  const events = useEvents({
    limit: PAGE_SIZE,
    offset,
    q: debounced || undefined,
  });

  return (
    <>
      <PageHeader
        title="Events"
        description="Accepted events, newest first. Each row was committed with its fan-out plan in a single transaction — an event is never acknowledged before it is durable."
        actions={
          <Button variant="primary" onClick={openSendEventDialog}>
            <Plus aria-hidden="true" />
            Send event
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Radio aria-hidden="true" className="size-[14px] text-fg-muted" />
            <span className="text-2xs text-fg-muted">
              {events.data ? `${events.data.total} events` : "Loading events"}
            </span>
          </div>
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setOffset(0);
            }}
            placeholder="Search event id or type"
            label="Search events"
          />
        </div>

        {events.isLoading ? (
          <LoadingState rows={8} cols={5} />
        ) : events.error ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} />
        ) : events.data && events.data.items.length === 0 ? (
          <EmptyState
            icon={debounced ? Radio : Inbox}
            title={debounced ? "No events match this search" : "No events yet"}
            description={
              debounced
                ? "Search matches the event id and the event type. Clear the search to see the full feed."
                : "Events appear here the moment they are committed. Send one to watch it fan out to your endpoints."
            }
            action={
              debounced ? (
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={openSendEventDialog}>
                  <Plus aria-hidden="true" />
                  Send an event
                </Button>
              )
            }
          />
        ) : (
          <>
            <TableWrap label="Events">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Received</TableHead>
                    <TableHead>Event type</TableHead>
                    <TableHead className="hidden md:table-cell">Fan-out</TableHead>
                    <TableHead className="hidden lg:table-cell">Payload</TableHead>
                    <TableHead className="w-[64px] text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.data?.items.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap">
                        <RelativeTime iso={event.created_at} />
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <Link
                          to={`/events/${event.id}`}
                          className="focus-ring block truncate rounded-xs font-medium text-fg hover:text-accent-ink"
                        >
                          {event.event_type}
                        </Link>
                        <span className="mt-1 block truncate font-mono text-[10px] text-fg-muted">
                          {event.id}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <FanOut
                          total={event.deliveries}
                          delivered={event.delivered}
                          inFlight={event.in_flight}
                          deadLetter={event.dead_letter}
                        />
                      </TableCell>
                      <TableCell className="hidden max-w-[320px] lg:table-cell">
                        <code className="block truncate font-mono text-[10px] text-fg-muted">
                          {JSON.stringify(event.payload)}
                        </code>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon-sm" asChild>
                          <Link to={`/events/${event.id}`} aria-label={`Open event ${event.id}`}>
                            <ArrowUpRight aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
            <Pagination
              total={events.data?.total ?? 0}
              limit={PAGE_SIZE}
              offset={offset}
              onChange={setOffset}
              unit="events"
            />
          </>
        )}
      </Card>
    </>
  );
}
