import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Command as CommandIcon,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Zap,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/common/utils";
import { setApiConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  "/": "Activity",
  "/events": "Events",
  "/deliveries": "Deliveries",
  "/endpoints": "Endpoints",
  "/dead-letter": "Dead letter",
  "/observability": "Metrics",
  "/settings": "Settings",
};

function crumb(pathname: string) {
  if (LABELS[pathname]) return LABELS[pathname];
  if (pathname.startsWith("/events/")) return "Event detail";
  if (pathname.startsWith("/deliveries/")) return "Delivery detail";
  if (pathname.startsWith("/endpoints/")) return "Endpoint detail";
  return "Activity";
}

export function Topbar({
  onOpenNav,
  onOpenCommand,
  onSendEvent,
}: {
  onOpenNav: () => void;
  onOpenCommand: () => void;
  onSendEvent: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <header className="sticky top-0 z-20 flex h-[48px] items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur-md md:px-8">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onOpenNav}
        aria-label="Open navigation"
      >
        <Menu aria-hidden="true" />
      </Button>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-2xs font-medium text-fg-muted">
          {crumb(location.pathname)}
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenCommand}
        className="focus-ring ml-auto hidden h-[28px] w-[220px] items-center gap-2 rounded-xs border border-line bg-surface-raised/40 px-3 text-2xs text-fg-muted transition-colors duration-[120ms] hover:border-line-strong hover:text-fg md:flex"
        aria-label="Open command palette"
      >
        <Search aria-hidden="true" className="size-[13px]" />
        Search or jump to…
        <span className="ml-auto flex items-center gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className={cn("flex items-center gap-2", "ml-auto md:ml-0")}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => queryClient.invalidateQueries()}
          aria-label="Refresh all data"
        >
          <RefreshCw aria-hidden="true" />
        </Button>

        <Button size="sm" onClick={onSendEvent}>
          <Plus aria-hidden="true" />
          Send event
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Open account menu">
              <span
                aria-hidden="true"
                className="flex size-[20px] items-center justify-center rounded-full border border-line-strong bg-surface-strong text-[10px] font-semibold text-fg"
              >
                OP
              </span>
              <ChevronDown aria-hidden="true" className="size-[12px] text-fg-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[208px]">
            <DropdownMenuLabel>Operator</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <Settings aria-hidden="true" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenCommand}>
              <CommandIcon aria-hidden="true" />
              Command palette
              <span className="ml-auto text-[10px] text-fg-muted">⌘K</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSendEvent}>
              <Zap aria-hidden="true" />
              Send test event
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setApiConfig({ token: "" });
                navigate("/login", { replace: true });
              }}
            >
              <LogOut aria-hidden="true" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
