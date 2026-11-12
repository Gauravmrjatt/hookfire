import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "focus-ring peer inline-flex h-[20px] w-[34px] shrink-0 cursor-pointer items-center rounded-full border border-line-strong",
      "transition-colors duration-[120ms] data-[state=checked]:bg-accent-ink data-[state=unchecked]:bg-surface-strong",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block size-[14px] rounded-full bg-surface shadow-1",
        "transition-transform duration-[120ms]",
        "data-[state=checked]:translate-x-[17px] data-[state=unchecked]:translate-x-[2px]",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
