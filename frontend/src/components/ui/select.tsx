import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Native select, tokenized. Native is deliberate: it is keyboard-complete,
 * screen-reader-complete, and touch-friendly on every platform for free.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative inline-flex w-full items-center">
    <select
      ref={ref}
      className={cn(
        "field-control h-[32px] w-full appearance-none rounded-xs pl-4 pr-[28px] text-xs text-fg",
        "transition-[background-color,box-shadow,outline-color] duration-[120ms]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[&>option]:bg-surface-raised [&>option]:text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute right-3 size-[14px] text-fg-muted"
    />
  </div>
));
Select.displayName = "Select";
