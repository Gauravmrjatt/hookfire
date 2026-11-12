/** Wire types — mirror the Go structs in internal/model + service. */

export type DeliveryStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "retrying"
  | "failed"
  | "dead_letter";

export interface Endpoint {
  id: string;
  name: string;
  url: string;
  active: boolean;
  rate_limit: number;
  created_at: string;
  updated_at: string;
}

export interface EventModel {
  id: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}

export interface EventSummary extends EventModel {
  deliveries: number;
  delivered: number;
  in_flight: number;
  dead_letter: number;
}

export interface Delivery {
  id: string;
  event_id: string;
  endpoint_id: string;
  status: DeliveryStatus;
  attempt_count: number;
  next_attempt_at?: string;
  last_attempt_at?: string;
  delivered_at?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRow extends Delivery {
  event_type: string;
  endpoint_name: string;
  endpoint_url: string;
}

export interface DeliveryAttempt {
  id: number;
  delivery_id: string;
  attempt_number: number;
  status_code?: number;
  response_time_ms?: number;
  error?: string;
  created_at: string;
}

export interface Stats {
  queue_depth: number;
  active_workers: number;
  deliveries_total: number;
  deliveries_successful: number;
  deliveries_failed: number;
  success_rate: number;
  dead_letter_count: number;
  average_latency_ms: number;
  p99_latency_ms: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface EventDeliveriesResponse {
  event: EventModel;
  deliveries: Delivery[];
}

export interface DeliveryDetailResponse {
  delivery: Delivery;
  attempts: DeliveryAttempt[];
}

export interface ReplayResponse {
  status: string;
  delivery: Delivery;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface CreateEndpointRequest {
  name: string;
  url: string;
  rate_limit?: number;
  secret?: string;
}

export interface CreateEventRequest {
  event_type: string;
  payload: unknown;
}
