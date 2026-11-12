import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function CommandDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="top-[18%] max-w-[560px] translate-y-0 overflow-hidden p-0"
        aria-label="Command palette"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <CommandPrimitive
          loop
          className={cn(
            "flex max-h-[440px] flex-col overflow-hidden",
            "[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2",
            "[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle",
          )}
        >
          {children}
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4">
      <Search aria-hidden="true" className="size-[15px] shrink-0 text-fg-muted" />
      <CommandPrimitive.Input
        className={cn(
          "h-10 w-full bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-[360px] overflow-y-auto overflow-x-hidden p-1", className)}
      {...props}
    />
  );
}

export function CommandEmpty(
  props: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>,
) {
  return (
    <CommandPrimitive.Empty
      className="py-8 text-center text-2xs text-fg-subtle"
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group className={cn(className)} {...props} />;
}

export function CommandItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "flex cursor-default select-none items-center gap-3 rounded-xs px-3 py-2 text-xs text-fg outline-none",
        "transition-colors duration-[85ms]",
        "data-[selected=true]:bg-surface-strong",
        "[&_svg]:size-[14px] [&_svg]:text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto text-2xs text-fg-subtle">{children}</span>;
}
