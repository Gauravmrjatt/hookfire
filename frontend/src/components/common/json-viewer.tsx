import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/common/utils";
import { cn } from "@/lib/utils";

/**
 * Read-only JSON surface. Values are rendered as text (never HTML), and long
 * payloads collapse so a 1 MiB event cannot push the rest of the page away.
 */
export function JsonViewer({
  value,
  className,
  collapsedHeight = 220,
  label = "Payload",
}: {
  value: unknown;
  className?: string;
  collapsedHeight?: number;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const lines = text.split("\n");
  const long = lines.length > 12;

  return (
    <div className={cn("overflow-hidden rounded-xs border border-line bg-surface", className)}>
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2">
        <span className="text-2xs font-medium text-fg-muted">{label}</span>
        <div className="flex items-center gap-1">
          {long ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <ChevronDown aria-hidden="true" className="size-[14px]" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-[14px]" />
              )}
              {expanded ? "Collapse" : `Expand ${lines.length} lines`}
            </Button>
          ) : null}
          <CopyButton value={text} label={`Copy ${label.toLowerCase()}`} />
        </div>
      </div>
      <pre
        className="overflow-auto p-4 font-mono text-2xs leading-[18px] text-fg-subtle"
        style={{
          maxHeight: expanded ? 520 : collapsedHeight,
          scrollbarWidth: "thin",
        }}
      >
        <code>{text}</code>
      </pre>
    </div>
  );
}
