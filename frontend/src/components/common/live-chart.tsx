import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * A dependency-free sparkline chart. The engine exposes counters, so charts
 * plot a session-local window; that is stated in the surrounding UI rather
 * than implied as historical data.
 *
 * Styling follows the console chart: 11/530 axis text in a 21px hairline bar,
 * a dashed 0.5px grid, and a 1.5px line over a fading area fill.
 */
export function LiveChart({
  data,
  label,
  format,
  tone = "info",
  height = 132,
  emptyHint = "Collecting samples…",
  className,
}: {
  data: number[];
  label: string;
  format: (value: number) => string;
  tone?: "info" | "success" | "warning" | "danger";
  height?: number;
  emptyHint?: string;
  className?: string;
}) {
  const gradientId = useId();
  const width = 600;
  const padTop = 8;
  const padBottom = 8;
  const plotHeight = height - padTop - padBottom;
  const latest = data.length > 0 ? data[data.length - 1] : 0;
  const max = Math.max(...data, 0.0001);
  const min = 0;

  const toneClass = {
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  if (data.length < 2) {
    return (
      <figure className={cn("flex flex-col", className)}>
        <div className="flex items-baseline justify-between gap-4">
          <figcaption className="text-2xs font-medium text-fg-muted">{label}</figcaption>
          <span className={cn("text-xs font-medium", toneClass)}>—</span>
        </div>
        <div
          className="mt-[8px] flex items-center justify-center rounded-xs bg-control"
          style={{ height }}
        >
          <span className="text-2xs font-medium text-fg-muted">{emptyHint}</span>
        </div>
      </figure>
    );
  }

  const step = width / (data.length - 1);
  const points = data.map((value, index) => {
    const x = index * step;
    const y = padTop + plotHeight - ((value - min) / (max - min)) * plotHeight;
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${padTop + plotHeight} L0,${padTop + plotHeight} Z`;

  return (
    <figure className={cn("flex flex-col", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <figcaption className="text-2xs font-medium text-fg-muted">{label}</figcaption>
        <span className={cn("text-xs font-medium", toneClass)}>{format(latest)}</span>
      </div>

      <svg
        role="img"
        aria-label={`${label}: latest ${format(latest)}, peak ${format(max)}`}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className={cn("mt-[8px] overflow-visible", toneClass)}
        fill="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={width}
            y1={padTop + plotHeight * fraction}
            y2={padTop + plotHeight * fraction}
            stroke="currentColor"
            strokeOpacity="0.16"
            strokeWidth="0.5"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The console's axis strip: a 21px layer-01 bar with hairline borders. */}
      <div className="mt-[8px] flex h-[21px] items-center justify-between rounded-xs border-[0.5px] border-line bg-surface-raised px-[8px] text-[11px] font-medium leading-4 text-fg-muted">
        <span>oldest</span>
        <span>peak {format(max)}</span>
        <span>now</span>
      </div>
    </figure>
  );
}
