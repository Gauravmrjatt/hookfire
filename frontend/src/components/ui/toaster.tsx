import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="dark"
      gap={8}
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast:
            "!bg-surface-raised !border !border-line !text-fg !shadow-1 !rounded-xs !text-xs",
          title: "!text-fg !font-medium",
          description: "!text-fg-subtle !text-2xs",
          actionButton: "!bg-primary !text-primary-foreground !rounded-xs",
          cancelButton: "!bg-surface-strong !text-fg !rounded-xs",
          closeButton: "!bg-surface-raised !border-line !text-fg-muted",
        },
      }}
    />
  );
}
