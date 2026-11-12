import { NavLink } from "react-router-dom";
import {
  Activity,
  Code2,
  ExternalLink,
  Inbox,
  Radio,
  Send,
  Settings,
  Webhook,
  Wifi,
  WifiOff,
  ChartColumn,
} from "lucide-react";

import { useReady, useStats } from "@/hooks/queries";
import { Kbd } from "@/components/common/utils";
import { getApiConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
  end?: boolean;
  badge?: number;
}

export function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data: stats } = useStats(20_000);
  const ready = useReady();
  const api = getApiConfig();

  const items: NavItem[] = [
    { to: "/", label: "Activity", icon: Activity, end: true },
    { to: "/events", label: "Events", icon: Radio },
    { to: "/deliveries", label: "Deliveries", icon: Send },
    { to: "/endpoints", label: "Endpoints", icon: Webhook },
    {
      to: "/dead-letter",
      label: "Dead letter",
      icon: Inbox,
      badge: stats?.dead_letter_count,
    },
    { to: "/observability", label: "Metrics", icon: ChartColumn },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[48px] items-center gap-3 border-b border-line px-8">
        <span
          aria-hidden="true"
          className="flex size-[22px] items-center justify-center rounded-xs border border-line-strong bg-surface-strong text-[11px] font-semibold text-fg"
        >
          H
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-2xs font-semibold leading-[14px] text-fg">
            Hookfire
          </span>
          <span className="truncate text-[10px] leading-[13px] text-fg-muted">
            Activity console
          </span>
        </div>
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
        <p className="px-3 pb-2 pt-1 text-2xs font-medium text-fg-muted">Operate</p>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "focus-ring group flex h-8 items-center gap-3 rounded-xs px-3 text-xs transition-colors duration-[85ms]",
                isActive
                  ? "bg-surface-raised text-fg"
                  : "text-fg-muted hover:bg-surface-raised/60 hover:text-fg",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  aria-hidden="true"
                  className={cn(
                    "size-[15px] shrink-0",
                    isActive ? "text-fg" : "text-fg-muted group-hover:text-fg",
                  )}
                />
                <span className="truncate">{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="ml-auto rounded-xs border border-danger/30 bg-danger/10 px-2 text-[10px] font-medium leading-[16px] text-danger">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}

        <div className="my-3 h-px bg-line" />

        <p className="px-3 pb-2 text-2xs font-medium text-fg-muted">Workspace</p>
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "focus-ring group flex h-8 items-center gap-3 rounded-xs px-3 text-xs transition-colors duration-[85ms]",
              isActive
                ? "bg-surface-raised text-fg"
                : "text-fg-muted hover:bg-surface-raised/60 hover:text-fg",
            )
          }
        >
          <Settings aria-hidden="true" className="size-[15px] shrink-0" />
          Settings
        </NavLink>
        <a
          href="https://github.com/Gauravmrjatt/hookfire"
          target="_blank"
          rel="noreferrer"
          className="focus-ring group flex h-8 items-center gap-3 rounded-xs px-3 text-xs text-fg-muted transition-colors duration-[85ms] hover:bg-surface-raised/60 hover:text-fg"
        >
          <Code2 aria-hidden="true" className="size-[15px] shrink-0" />
          Source
          <ExternalLink aria-hidden="true" className="ml-auto size-[12px]" />
        </a>
      </nav>

      <div className="flex flex-col gap-2 border-t border-line p-4">
        <div className="flex items-center gap-2 rounded-xs border border-line bg-surface-raised/40 px-3 py-2">
          {ready.isSuccess ? (
            <Wifi aria-hidden="true" className="size-[13px] text-success" />
          ) : (
            <WifiOff aria-hidden="true" className="size-[13px] text-danger" />
          )}
          <span className="text-2xs text-fg-muted">
            {ready.isSuccess ? "Engine online" : "Engine unreachable"}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "ml-auto size-[6px] rounded-full",
              ready.isSuccess ? "bg-success" : "bg-danger",
            )}
          />
        </div>
        <div className="flex items-center justify-between px-1">
          <span className="truncate text-[10px] text-fg-muted">
            {api.baseUrl ? new URL(api.baseUrl, window.location.origin).host : window.location.host}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-fg-muted">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] border-r border-line bg-surface lg:block">
      <NavContent />
    </aside>
  );
}
