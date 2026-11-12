import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-8 py-16 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="rounded-xs border border-line bg-surface-raised/60 p-4">
          <Icon aria-hidden="true" className="size-[18px] text-fg-muted" />
        </span>
      ) : null}
      <h2 className="text-xs font-semibold text-fg">{title}</h2>
      {description ? (
        <p className="max-w-[46ch] text-2xs leading-[18px] text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const apiError = error instanceof ApiError ? error : undefined;
  const unauthorized = apiError?.status === 401;

  return (
    <div className={cn("flex flex-col items-center gap-3 px-8 py-16 text-center", className)}>
      <h2 className="text-xs font-semibold text-fg">
        {unauthorized ? "Session expired" : "Could not load this view"}
      </h2>
      <p className="max-w-[52ch] text-2xs leading-[18px] text-fg-muted">
        {unauthorized
          ? "The bearer token was rejected by the engine. Reconnect with a freshly minted JWT."
          : (apiError?.message ?? (error instanceof Error ? error.message : "Unexpected error."))}
      </p>
      {onRetry && !unauthorized ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <SkeletonRows rows={rows} cols={cols} />
    </div>
  );
}
