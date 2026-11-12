import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-line pb-8 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-md font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {description ? (
          <p className="max-w-[72ch] text-xs text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
