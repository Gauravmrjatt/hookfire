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
            "!bg-surface-raised !border-[0.5px] !border-line !text-fg !shadow-overlay !rounded-xs !text-xs",
          title: "!text-fg !font-medium",
          description: "!text-fg-muted !text-2xs",
          actionButton: "!bg-primary !text-primary-foreground !rounded-xs",
          cancelButton: "!bg-control !text-fg !rounded-xs",
          closeButton: "!bg-surface-raised !border-line !text-fg-muted",
        },
      }}
    />
  );
}
