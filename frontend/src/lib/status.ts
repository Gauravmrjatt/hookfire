import type { DeliveryStatus } from "@/types/api";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Short operator-facing explanation, used in tooltips and detail views. */
  description: string;
}

export const STATUS_META: Record<DeliveryStatus, StatusMeta> = {
  pending: {
    label: "Pending",
    tone: "neutral",
    description: "Queued and waiting for a worker to claim it.",
  },
  processing: {
    label: "Processing",
    tone: "info",
    description: "A worker holds the row and is making the HTTP attempt now.",
  },
  delivered: {
    label: "Delivered",
    tone: "success",
    description: "The subscriber returned a 2xx response.",
  },
  retrying: {
    label: "Retrying",
    tone: "warning",
    description: "A retryable failure was recorded; the next attempt is scheduled.",
  },
  failed: {
    label: "Failed",
    tone: "danger",
    description: "Terminal failure recorded by the engine.",
  },
  dead_letter: {
    label: "Dead letter",
    tone: "danger",
    description: "Retries exhausted or a permanent 4xx. Replay is available.",
  },
};

export function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status as DeliveryStatus] ?? {
      label: status,
      tone: "neutral",
      description: "Unknown status reported by the engine.",
    }
  );
}

export const toneStyles: Record<Tone, string> = {
  neutral: "border-line-strong bg-surface-strong text-fg",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
};

export const toneDot: Record<Tone, string> = {
  neutral: "bg-fg-muted",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

/** Statuses a delivery can hold while it is still moving through the queue. */
export const IN_FLIGHT_STATUSES: DeliveryStatus[] = [
  "pending",
  "processing",
  "retrying",
];

export const STATUS_ORDER: DeliveryStatus[] = [
  "pending",
  "processing",
  "delivered",
  "retrying",
  "failed",
  "dead_letter",
];
