import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Page heading matched to the console's type ramp: a 21/530/24 title, a
 * 13/440/20 description, and an 8% hairline separating the header from content.
 */
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
        "flex flex-col gap-4 border-b-[0.5px] border-line pb-[24px] md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-[21px] font-medium leading-[24px] tracking-[-0.04px] text-fg">
          {title}
        </h1>
        {description ? (
          <p className="max-w-[72ch] text-xs leading-[20px] text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-4">{actions}</div> : null}
    </header>
  );
}
