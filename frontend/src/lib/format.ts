const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const shortDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const fullDate = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const timeOnly = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatAbsolute(iso?: string) {
  if (!iso) return "—";
  return fullDate.format(new Date(iso));
}

export function formatShort(iso?: string) {
  if (!iso) return "—";
  return shortDate.format(new Date(iso));
}

export function formatTime(iso?: string) {
  if (!iso) return "—";
  return timeOnly.format(new Date(iso));
}

/** "12s ago" / "in 4m" — clamps absurd values instead of printing years. */
export function formatRelative(iso: string | undefined, now = Date.now()) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const delta = then - now;
  const abs = Math.abs(delta);

  if (abs < 5_000) return "just now";
  if (abs < 60_000) return rtf.format(Math.round(delta / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(delta / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(delta / 3_600_000), "hour");
  return rtf.format(Math.round(delta / 86_400_000), "day");
}

export function formatDuration(ms?: number) {
  if (ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function formatMs(ms?: number) {
  if (ms === undefined) return "—";
  return `${Math.round(ms)}ms`;
}

export function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number) {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function truncate(value: string, max = 48) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/** Host + path, no query string — endpoints get long fast. */
export function prettyUrl(raw: string) {
  try {
    const url = new URL(raw);
    return `${url.host}${url.pathname}`;
  } catch {
    return raw;
  }
}

export function newIdempotencyKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `dash-${hex}`;
}
