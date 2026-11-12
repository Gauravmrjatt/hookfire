import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import type {
  CreateEndpointRequest,
  CreateEventRequest,
  DeliveryDetailResponse,
  DeliveryRow,
  Delivery,
  Endpoint,
  EventDeliveriesResponse,
  EventModel,
  EventSummary,
  Page,
  ReplayResponse,
  Stats,
} from "@/types/api";

function qs(params: Record<string, string | number | undefined | string[]>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      sp.set(key, value.join(","));
      continue;
    }
    sp.set(key, String(value));
  }
  const out = sp.toString();
  return out ? `?${out}` : "";
}

export const qk = {
  stats: ["stats"] as const,
  endpoints: ["endpoints"] as const,
  endpoint: (id: string) => ["endpoints", id] as const,
  events: (params: EventParams) => ["events", params] as const,
  event: (id: string) => ["event", id] as const,
  eventDeliveries: (id: string) => ["event", id, "deliveries"] as const,
  deliveries: (params: DeliveryParams) => ["deliveries", params] as const,
  delivery: (id: string) => ["delivery", id] as const,
  deadLetter: (limit: number, offset: number) => ["dlq", limit, offset] as const,
} as const;

export interface EventParams {
  limit?: number;
  offset?: number;
  q?: string;
  event_type?: string;
}

export interface DeliveryParams {
  limit?: number;
  offset?: number;
  q?: string;
  status?: string[];
  endpoint_id?: string;
  event_id?: string;
}

export function useStats(refetchInterval: number | false = 5_000) {
  return useQuery({
    queryKey: qk.stats,
    queryFn: () => apiRequest<Stats>("/v1/stats"),
    refetchInterval,
    staleTime: 2_000,
  });
}

export function useEndpoints() {
  return useQuery({
    queryKey: qk.endpoints,
    queryFn: () => apiRequest<Endpoint[]>("/v1/endpoints"),
    staleTime: 15_000,
  });
}

export function useEndpoint(id?: string) {
  return useQuery({
    queryKey: qk.endpoint(id ?? ""),
    queryFn: () => apiRequest<Endpoint>(`/v1/endpoints/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEndpointRequest) =>
      apiRequest<Endpoint & { secret?: string }>("/v1/endpoints", {
        method: "POST",
        body,
      }),
    onSuccess: (endpoint) => {
      queryClient.invalidateQueries({ queryKey: qk.endpoints });
      toast.success("Endpoint registered", { description: endpoint.name });
    },
    onError: (error: Error) => {
      toast.error("Could not register endpoint", { description: error.message });
    },
  });
}

export function useDeleteEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/v1/endpoints/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.endpoints });
      toast.success("Endpoint deactivated", {
        description: "No new deliveries will fan out to it.",
      });
    },
    onError: (error: Error) => {
      toast.error("Could not deactivate endpoint", { description: error.message });
    },
  });
}

export function useEvents(params: EventParams = {}) {
  return useQuery({
    queryKey: qk.events(params),
    queryFn: () =>
      apiRequest<Page<EventSummary>>(
        `/v1/events${qs({
          limit: params.limit ?? 25,
          offset: params.offset ?? 0,
          q: params.q,
          event_type: params.event_type,
        })}`,
      ),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
}

export function useEvent(id?: string) {
  return useQuery({
    queryKey: qk.event(id ?? ""),
    queryFn: () => apiRequest<EventModel>(`/v1/events/${id}`),
    enabled: Boolean(id),
  });
}

export function useEventDeliveries(id?: string) {
  return useQuery({
    queryKey: qk.eventDeliveries(id ?? ""),
    queryFn: () => apiRequest<EventDeliveriesResponse>(`/v1/events/${id}/deliveries`),
    enabled: Boolean(id),
  });
}

export function useDeliveries(params: DeliveryParams = {}) {
  return useQuery({
    queryKey: qk.deliveries(params),
    queryFn: () =>
      apiRequest<Page<DeliveryRow>>(
        `/v1/deliveries${qs({
          limit: params.limit ?? 25,
          offset: params.offset ?? 0,
          q: params.q,
          status: params.status,
          endpoint_id: params.endpoint_id,
          event_id: params.event_id,
        })}`,
      ),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
}

export function useDelivery(id?: string) {
  return useQuery({
    queryKey: qk.delivery(id ?? ""),
    queryFn: () => apiRequest<DeliveryDetailResponse>(`/v1/deliveries/${id}`),
    enabled: Boolean(id),
  });
}

export function useReplayDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<ReplayResponse>(`/v1/deliveries/${id}/replay`, { method: "POST" }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["dlq"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["delivery", result.delivery.id] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Delivery replayed", {
        description: "Original event id preserved — no duplicate event created.",
      });
    },
    onError: (error: Error) => {
      toast.error("Replay failed", { description: error.message });
    },
  });
}

export function useDeadLetter(limit = 25, offset = 0) {
  return useQuery({
    queryKey: qk.deadLetter(limit, offset),
    queryFn: () =>
      apiRequest<{ items: Delivery[] }>(
        `/v1/deliveries/dead-letter${qs({ limit, offset })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: CreateEventRequest }) =>
      apiRequest<EventModel>("/v1/events", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": key },
      }),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Event accepted", {
        description: `${event.event_type} · ${event.id}`,
      });
    },
    onError: (error: Error) => {
      toast.error("Event rejected", { description: error.message });
    },
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiRequest<{ status: string }>("/health"),
    refetchInterval: 30_000,
    retry: 0,
  });
}

export function useReady() {
  return useQuery({
    queryKey: ["ready"],
    queryFn: () => apiRequest<Record<string, unknown>>("/ready"),
    refetchInterval: 30_000,
    retry: 0,
  });
}
