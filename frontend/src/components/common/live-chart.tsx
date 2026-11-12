import { cn } from "@/lib/utils";

/**
 * A dependency-free sparkline chart. The engine exposes counters, so charts
 * plot a session-local window; that is stated in the surrounding UI rather
 * than implied as historical data.
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
  const width = 600;
  const padTop = 8;
  const padBottom = 18;
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
      <div
        className={cn(
          "flex items-center justify-center rounded-xs border border-line bg-surface",
          className,
        )}
        style={{ height }}
      >
        <span className="text-2xs text-fg-muted">{emptyHint}</span>
      </div>
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
    <figure className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <figcaption className="text-2xs text-fg-muted">{label}</figcaption>
        <span className={cn("text-xs font-medium", toneClass)}>{format(latest)}</span>
      </div>

      <svg
        role="img"
        aria-label={`${label}: latest ${format(latest)}, peak ${format(max)}`}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className={cn("overflow-visible rounded-xs border border-line bg-surface", toneClass)}
        fill="none"
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={width}
            y1={padTop + plotHeight * fraction}
            y2={padTop + plotHeight * fraction}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill="currentColor" opacity="0.08" />
        <path
          d={line}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex items-center justify-between text-[10px] text-fg-muted">
        <span>oldest</span>
        <span>
          peak {format(max)}
        </span>
        <span>now</span>
      </div>
    </figure>
  );
}
