import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/common/states";
import { Card } from "@/components/ui/card";
import { titleForPath, useDocumentTitle } from "@/hooks/use-document-title";
import { useSession } from "@/hooks/use-session";

// Route-level code splitting keeps the first paint small; the shell is the
// only module every authenticated screen pays for.
const ActivityPage = lazy(() =>
  import("@/features/activity/activity-page").then((m) => ({ default: m.ActivityPage })),
);
const LoginPage = lazy(() =>
  import("@/features/auth/login-page").then((m) => ({ default: m.LoginPage })),
);
const EventsPage = lazy(() =>
  import("@/features/events/events-page").then((m) => ({ default: m.EventsPage })),
);
const EventDetailPage = lazy(() =>
  import("@/features/events/event-detail-page").then((m) => ({ default: m.EventDetailPage })),
);
const DeliveriesPage = lazy(() =>
  import("@/features/deliveries/deliveries-page").then((m) => ({ default: m.DeliveriesPage })),
);
const DeliveryDetailPage = lazy(() =>
  import("@/features/deliveries/delivery-detail-page").then((m) => ({
    default: m.DeliveryDetailPage,
  })),
);
const EndpointsPage = lazy(() =>
  import("@/features/endpoints/endpoints-page").then((m) => ({ default: m.EndpointsPage })),
);
const EndpointDetailPage = lazy(() =>
  import("@/features/endpoints/endpoint-detail-page").then((m) => ({
    default: m.EndpointDetailPage,
  })),
);
const DeadLetterPage = lazy(() =>
  import("@/features/dlq/dead-letter-page").then((m) => ({ default: m.DeadLetterPage })),
);
const MetricsPage = lazy(() =>
  import("@/features/metrics/metrics-page").then((m) => ({ default: m.MetricsPage })),
);
const SettingsPage = lazy(() =>
  import("@/features/settings/settings-page").then((m) => ({ default: m.SettingsPage })),
);
const NotFoundPage = lazy(() =>
  import("@/features/not-found-page").then((m) => ({ default: m.NotFoundPage })),
);

function RequireAuth({ children }: { children: ReactNode }) {
  const { connected } = useSession();
  const location = useLocation();

  if (!connected) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { connected } = useSession();
  if (connected) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RouteFallback() {
  return (
    <Card>
      <LoadingState rows={6} cols={4} />
    </Card>
  );
}

export function App() {
  const location = useLocation();
  useDocumentTitle(titleForPath(location.pathname));

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<ActivityPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/deliveries/:id" element={<DeliveryDetailPage />} />
          <Route path="/endpoints" element={<EndpointsPage />} />
          <Route path="/endpoints/:id" element={<EndpointDetailPage />} />
          <Route path="/dead-letter" element={<DeadLetterPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
