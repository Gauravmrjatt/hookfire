import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const toneText = {
  neutral: "text-fg",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
} as const;

export function Sparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const width = 132;
  const height = 30;

  if (data.length < 2) {
    return <div aria-hidden="true" className={cn("h-[30px] w-[132px]", className)} />;
  }

  const max = Math.max(...data, 0.0001);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((value, index) => {
    const x = index * step;
    const y = height - 2 - ((value - min) / span) * (height - 6);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("overflow-visible text-info", className)}
      fill="none"
    >
      <path d={area} fill="currentColor" opacity="0.1" />
      <path d={line} stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="1.75" fill="currentColor" />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
  series,
  footer,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof toneText;
  icon?: LucideIcon;
  series?: number[];
  footer?: ReactNode;
}) {
  return (
    <Card className="p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-fg-muted">{label}</span>
          <span className={cn("text-md font-semibold tracking-[-0.02em]", toneText[tone])}>
            {value}
          </span>
        </div>
        {Icon ? (
          <span className="rounded-xs border border-line p-2 text-fg-muted">
            <Icon aria-hidden="true" className="size-[14px]" />
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="text-2xs text-fg-muted">{hint}</div>
        {series && series.length > 1 ? <Sparkline data={series} /> : null}
      </div>
      {footer ? <div className="mt-4 border-t border-line pt-4">{footer}</div> : null}
    </Card>
  );
}
