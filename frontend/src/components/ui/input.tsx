import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-xs font-medium text-fg peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "focus-ring h-[32px] w-full rounded-xs border border-line-strong bg-surface px-4 text-xs text-fg",
      "placeholder:text-fg-muted",
      "transition-colors duration-[120ms] hover:bg-surface-raised/30",
      "disabled:cursor-not-allowed disabled:opacity-45",
      "aria-invalid:border-danger/60 aria-invalid:hover:border-danger/60",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "focus-ring w-full resize-y rounded-xs border border-line-strong bg-surface px-4 py-4 font-mono text-2xs leading-[18px] text-fg",
      "placeholder:text-fg-muted",
      "transition-colors duration-[120ms] hover:bg-surface-raised/30",
      "disabled:cursor-not-allowed disabled:opacity-45",
      "aria-invalid:border-danger/60",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-2xs text-danger">
      {children}
    </p>
  );
}
