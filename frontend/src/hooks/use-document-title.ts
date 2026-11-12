import { useEffect } from "react";

const SUFFIX = "Hookfire Activity";

/** Route titles are announced on navigation and set the tab label. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export function titleForPath(pathname: string) {
  if (pathname === "/") return "Activity";
  if (pathname === "/login") return "Connect";
  if (pathname === "/events") return "Events";
  if (pathname.startsWith("/events/")) return "Event detail";
  if (pathname === "/deliveries") return "Deliveries";
  if (pathname.startsWith("/deliveries/")) return "Delivery detail";
  if (pathname === "/endpoints") return "Endpoints";
  if (pathname.startsWith("/endpoints/")) return "Endpoint detail";
  if (pathname === "/dead-letter") return "Dead letter";
  if (pathname === "/metrics") return "Metrics";
  if (pathname === "/settings") return "Settings";
  return "Page not found";
}
