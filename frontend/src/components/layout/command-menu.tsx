import { useNavigate } from "react-router-dom";
import {
  Activity,
  ChartColumn,
  Inbox,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings,
  Webhook,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useEndpoints } from "@/hooks/queries";
import { Kbd } from "@/components/common/utils";

export function CommandMenu({
  open,
  onOpenChange,
  onSendEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendEvent: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: endpoints } = useEndpoints();

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, endpoints, actions…" />
      <CommandList>
        <CommandEmpty>No matches found.</CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => run(() => navigate("/"))}>
            <Activity aria-hidden="true" />
            Activity
            <CommandShortcut>Overview</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/events"))}>
            <Radio aria-hidden="true" />
            Events
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/deliveries"))}>
            <Send aria-hidden="true" />
            Deliveries
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/endpoints"))}>
            <Webhook aria-hidden="true" />
            Endpoints
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/dead-letter"))}>
            <Inbox aria-hidden="true" />
            Dead letter
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/observability"))}>
            <ChartColumn aria-hidden="true" />
            Metrics
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/settings"))}>
            <Settings aria-hidden="true" />
            Settings
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(onSendEvent)}>
            <Plus aria-hidden="true" />
            Send test event
            <CommandShortcut>
              <Kbd>E</Kbd>
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                queryClient.invalidateQueries();
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Refresh all data
          </CommandItem>
        </CommandGroup>

        {endpoints && endpoints.length > 0 ? (
          <CommandGroup heading="Endpoints">
            {endpoints.slice(0, 8).map((endpoint) => (
              <CommandItem
                key={endpoint.id}
                value={`${endpoint.name} ${endpoint.url}`}
                onSelect={() => run(() => navigate(`/endpoints/${endpoint.id}`))}
              >
                <Webhook aria-hidden="true" />
                <span className="truncate">{endpoint.name}</span>
                <span className="ml-auto truncate text-[10px] text-fg-subtle">
                  {endpoint.active ? "active" : "inactive"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[10px] text-fg-subtle">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="flex items-center gap-1">
          <Kbd>esc</Kbd> close
        </span>
      </div>
    </CommandDialog>
  );
}
