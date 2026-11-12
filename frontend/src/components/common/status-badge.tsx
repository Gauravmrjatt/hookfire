import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { statusMeta, toneDot } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  withTooltip = true,
  className,
}: {
  status: string;
  withTooltip?: boolean;
  className?: string;
}) {
  const meta = statusMeta(status);

  const badge = (
    <Badge tone={meta.tone} className={cn("gap-[6px] pl-[6px]", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "size-[6px] shrink-0 rounded-full",
          toneDot[meta.tone],
          (status === "processing" || status === "retrying") && "animate-[hf-pulse_1.8s_ease-in-out_infinite]",
        )}
      />
      {meta.label}
    </Badge>
  );

  if (!withTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-xs" aria-label={`${meta.label}: ${meta.description}`}>
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent>{meta.description}</TooltipContent>
    </Tooltip>
  );
}
