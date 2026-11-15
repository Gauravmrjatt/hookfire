import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/* The console scrim is a 60% black wash with no blur; elevation, not borders,
   separates the panel from the page. */
const overlayClass =
  "fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0";

const closeButtonClass =
  "focus-ring absolute right-[12px] top-[12px] flex size-[24px] items-center justify-center rounded-[4px] text-fg-muted transition-colors duration-[85ms] hover:bg-control hover:text-fg";

export function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  showClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2",
          "max-h-[calc(100dvh-32px)] overflow-y-auto rounded-xs bg-surface-raised p-[16px] shadow-overlay",
          "duration-[200ms] data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className={closeButtonClass} aria-label="Close dialog">
            <X aria-hidden="true" className="size-[14px]" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-[16px] flex flex-col gap-2 pr-[24px] text-left", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-[24px] flex flex-col-reverse gap-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "text-sm font-medium leading-[20px] tracking-[-0.13px] text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-xs leading-[20px] text-fg-muted", className)}
      {...props}
    />
  );
}

/**
 * Sheet — the console's side drawer: a layer-01 panel inset 8px from the
 * viewport edge, with overlay elevation rather than a border.
 */
export function SheetContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  showClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        className={cn(
          "fixed right-[8px] top-[8px] z-50 flex h-[calc(100dvh-16px)] w-[min(560px,calc(100vw-16px))] flex-col overflow-y-auto",
          "rounded-xs bg-surface-raised p-[16px] shadow-overlay",
          "duration-[200ms] data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:slide-in-from-right-4 data-[state=closed]:slide-out-to-right-4",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className={closeButtonClass} aria-label="Close panel">
            <X aria-hidden="true" className="size-[14px]" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
