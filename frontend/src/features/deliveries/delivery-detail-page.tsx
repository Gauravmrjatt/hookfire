import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeliveryDetail } from "@/features/deliveries/delivery-detail";
import { useDelivery } from "@/hooks/queries";

export function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const delivery = useDelivery(id);

  return (
    <>
      <div className="flex flex-col gap-4">
        <Link
          to="/deliveries"
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-xs text-2xs text-fg-muted transition-colors duration-[120ms] hover:text-fg"
        >
          <ArrowLeft aria-hidden="true" className="size-[13px]" />
          Deliveries
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-8">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-md font-semibold tracking-[-0.02em] text-fg">
              Delivery detail
            </h1>
            <p className="text-2xs text-fg-muted">
              Every HTTP attempt is recorded, including transport failures that
              never produced a status code.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/events/${delivery.data?.delivery.event_id ?? ""}`}>
              Open event
            </Link>
          </Button>
        </div>
      </div>

      <Card className="p-8">
        {delivery.isLoading ? (
          <LoadingState rows={6} cols={2} />
        ) : delivery.error || !id ? (
          <ErrorState error={delivery.error} onRetry={() => delivery.refetch()} />
        ) : (
          <DeliveryDetail id={id} />
        )}
      </Card>
    </>
  );
}
