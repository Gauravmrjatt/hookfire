import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-xs bg-surface-strong/50",
        "before:absolute before:inset-0 before:animate-[hf-shimmer_1.6s_linear_infinite]",
        "before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent)] before:bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-2 p-8" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton
              key={c}
              className={cn("h-[12px]", c === 0 ? "w-[35%]" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
