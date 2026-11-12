import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  MoreHorizontal,
  Plus,
  Power,
  Webhook,
} from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { CopyButton, RelativeTime } from "@/components/common/utils";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateEndpointDialog } from "@/features/endpoints/create-endpoint-dialog";
import { useDeleteEndpoint, useEndpoints } from "@/hooks/queries";
import { prettyUrl } from "@/lib/format";
import { openSendEventDialog } from "@/lib/ui-events";

export function EndpointsPage() {
  const endpoints = useEndpoints();
  const remove = useDeleteEndpoint();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(
    null,
  );

  return (
    <>
      <PageHeader
        title="Endpoints"
        description="Registered subscribers. Each accepted event fans out one delivery per active endpoint, signed with that endpoint's secret and paced by its rate limit."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            Register endpoint
          </Button>
        }
      />

      {endpoints.isLoading ? (
        <Card>
          <LoadingState rows={5} cols={3} />
        </Card>
      ) : endpoints.error ? (
        <Card>
          <ErrorState error={endpoints.error} onRetry={() => endpoints.refetch()} />
        </Card>
      ) : endpoints.data && endpoints.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Webhook}
            title="No endpoints registered"
            description="An endpoint is the destination for events. Register one, then send an event and watch the delivery appear in Activity."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  Register endpoint
                </Button>
                <Button size="sm" variant="outline" onClick={openSendEventDialog}>
                  Send an event
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {endpoints.data?.map((endpoint) => (
            <li key={endpoint.id}>
              <Card className="flex h-full flex-col p-8 transition-colors duration-[150ms] hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      to={`/endpoints/${endpoint.id}`}
                      className="focus-ring truncate rounded-xs text-xs font-semibold text-fg hover:text-accent-ink"
                    >
                      {endpoint.name}
                    </Link>
                    <span className="font-mono text-[10px] text-fg-muted">
                      {endpoint.id}
                    </span>
                  </div>
                  <Badge tone={endpoint.active ? "success" : "neutral"}>
                    {endpoint.active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="mt-4 flex items-start gap-2">
                  <code
                    className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-subtle"
                    title={endpoint.url}
                  >
                    {prettyUrl(endpoint.url)}
                  </code>
                  <CopyButton value={endpoint.url} label="Copy endpoint URL" />
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-2xs">
                  <div className="flex flex-col gap-1">
                    <dt className="text-fg-muted">Rate limit</dt>
                    <dd className="text-fg">
                      {endpoint.rate_limit === 0
                        ? "Engine default"
                        : `${endpoint.rate_limit}/s`}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-fg-muted">Created</dt>
                    <dd>
                      <RelativeTime iso={endpoint.created_at} />
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
                  <Button size="sm" variant="outline" asChild className="flex-1">
                    <Link to={`/endpoints/${endpoint.id}`}>
                      Open endpoint
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${endpoint.name}`}
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!endpoint.active}
                        onSelect={() =>
                          setPendingDelete({ id: endpoint.id, name: endpoint.name })
                        }
                      >
                        <Power aria-hidden="true" />
                        Deactivate endpoint
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CreateEndpointDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Deactivate ${pendingDelete?.name ?? "endpoint"}?`}
        description="The endpoint stops receiving new deliveries immediately. Delivery history and the endpoint record are preserved, so this is reversible at the database level."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await remove.mutateAsync(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
