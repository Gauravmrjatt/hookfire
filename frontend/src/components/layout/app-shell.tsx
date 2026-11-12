import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { CommandMenu } from "@/components/layout/command-menu";
import { NavContent, Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { SendEventDialog } from "@/features/events/send-event-dialog";
import { setApiConfig } from "@/lib/api";

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      if (!typing && event.key === "?" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A rejected bearer token drops the session and returns to the connect screen.
  useEffect(() => {
    function onUnauthorized() {
      setApiConfig({ token: "" });
      toast.error("Session expired", {
        description: "The engine rejected the bearer token. Reconnect to continue.",
      });
      navigate("/login", { replace: true });
    }
    window.addEventListener("hookfire:unauthorized", onUnauthorized);
    return () => window.removeEventListener("hookfire:unauthorized", onUnauthorized);
  }, [navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  // Any page can request the global "send event" dialog.
  useEffect(() => {
    const open = () => setSendOpen(true);
    window.addEventListener("hookfire:send-event", open);
    return () => window.removeEventListener("hookfire:send-event", open);
  }, []);

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xs focus:bg-primary focus:px-4 focus:py-2 focus:text-xs focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <Sidebar />

      <div className="flex min-h-screen flex-col lg:pl-[236px]">
        <Topbar
          onOpenNav={() => setNavOpen(true)}
          onOpenCommand={() => setCommandOpen(true)}
          onSendEvent={() => setSendOpen(true)}
        />

        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-8 md:px-8">
          <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-line px-4 py-4 md:px-8">
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-4 text-[10px] text-fg-muted">
            <span>Hookfire Activity console</span>
            <span aria-hidden="true">·</span>
            <span>at-least-once delivery</span>
            <span className="ml-auto flex items-center gap-3">
              <a
                className="focus-ring rounded-xs hover:text-fg"
                href="https://github.com/Gauravmrjatt/hookfire"
                target="_blank"
                rel="noreferrer"
              >
                Documentation
              </a>
              <a className="focus-ring rounded-xs hover:text-fg" href="/metrics" target="_blank" rel="noreferrer">
                Prometheus metrics
              </a>
            </span>
          </div>
        </footer>
      </div>

      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent showClose={false} className="max-w-[280px] p-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <NavContent onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Dialog>

      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onSendEvent={() => setSendOpen(true)}
      />
      <SendEventDialog open={sendOpen} onOpenChange={setSendOpen} />
    </div>
  );
}
