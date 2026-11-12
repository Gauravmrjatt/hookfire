import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clipboard, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-debounced";
import { formatAbsolute, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-line-strong bg-surface px-1 font-sans text-[10px] font-medium text-fg-muted">
      {children}
    </kbd>
  );
}

export function RelativeTime({ iso, className }: { iso?: string; className?: string }) {
  const now = useNow();
  if (!iso) return <span className={className}>—</span>;
  return (
    <time
      dateTime={iso}
      title={formatAbsolute(iso)}
      className={cn("whitespace-nowrap text-fg-muted", className)}
    >
      {formatRelative(iso, now)}
    </time>
  );
}

export function CopyButton({
  value,
  label = "Copy value",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast.error("Copy failed", {
        description: "Clipboard access was blocked by the browser.",
      });
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          aria-label={label}
          className={className}
        >
          {copied ? (
            <Check aria-hidden="true" className="text-success" />
          ) : (
            <Clipboard aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:w-[260px]", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-[14px] -translate-y-1/2 text-fg-muted"
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        className="pl-8 pr-8"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-xs p-1 text-fg-muted hover:text-fg"
        >
          <X aria-hidden="true" className="size-[12px]" />
        </button>
      ) : null}
    </div>
  );
}

export function Pagination({
  total,
  limit,
  offset,
  onChange,
  unit = "items",
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  unit?: string;
}) {
  if (total === 0) return null;
  const start = offset + 1;
  const end = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = end < total;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 border-t border-line px-8 py-4"
    >
      <p className="text-2xs text-fg-muted">
        Showing <span className="text-fg">{start}</span>–
        <span className="text-fg">{end}</span> of{" "}
        <span className="text-fg">{total}</span> {unit}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          onClick={() => onChange(Math.max(offset - limit, 0))}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onChange(offset + limit)}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
