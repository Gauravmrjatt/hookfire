import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { toneStyles, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-xs border px-2 py-[1px] text-2xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: toneStyles.neutral,
        success: toneStyles.success,
        warning: toneStyles.warning,
        danger: toneStyles.danger,
        info: toneStyles.info,
      } satisfies Record<Tone, string>,
      shape: {
        default: "",
        dot: "pl-[6px]",
        mono: "font-mono",
      },
    },
    defaultVariants: { tone: "neutral", shape: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, shape, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, shape }), className)} {...props} />;
}
