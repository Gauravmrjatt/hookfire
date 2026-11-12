import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "focus-ring inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xs font-medium transition-[background-color,color,border-color,box-shadow] duration-[120ms] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[16px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        secondary:
          "border border-line bg-surface-strong text-fg hover:bg-surface-strong/80 active:bg-surface-strong/70",
        outline:
          "border border-line-strong bg-transparent text-fg hover:bg-surface-raised active:bg-surface-strong",
        ghost:
          "bg-transparent text-fg-muted hover:bg-surface-raised hover:text-fg active:bg-surface-strong",
        danger:
          "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 active:bg-danger/25",
        link: "h-auto bg-transparent p-0 text-accent-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 px-3 text-2xs",
        default: "h-8 px-4 text-xs",
        lg: "h-10 px-6 text-sm",
        icon: "size-[32px] p-0",
        "icon-sm": "size-[28px] p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 aria-hidden="true" className="animate-spin" />
            <span className="sr-only">Working</span>
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
