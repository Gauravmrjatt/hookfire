import type { ApiErrorBody } from "@/types/api";

/**
 * Connection settings live in localStorage so an operator can point the
 * dashboard at any engine without a rebuild. The token is a bearer credential:
 * it is stored in this browser only and never sent anywhere except the
 * configured API base URL.
 */
const TOKEN_KEY = "hookfire.token";
const BASE_KEY = "hookfire.baseUrl";

export interface ApiConfig {
  token: string;
  baseUrl: string;
}

const listeners = new Set<(c: ApiConfig) => void>();

export function getApiConfig(): ApiConfig {
  let token = "";
  let baseUrl = "";
  try {
    token = localStorage.getItem(TOKEN_KEY) ?? "";
    baseUrl = localStorage.getItem(BASE_KEY) ?? "";
  } catch {
    // Private-mode storage failures must not break the app.
  }
  return {
    token,
    baseUrl: baseUrl || (import.meta.env.VITE_API_BASE_URL ?? ""),
  };
}

export function setApiConfig(next: Partial<ApiConfig>) {
  if (next.token !== undefined) localStorage.setItem(TOKEN_KEY, next.token);
  if (next.baseUrl !== undefined) localStorage.setItem(BASE_KEY, next.baseUrl);
  const cfg = getApiConfig();
  listeners.forEach((fn) => fn(cfg));
}

export function clearApiConfig() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(BASE_KEY);
  listeners.forEach((fn) => fn(getApiConfig()));
}

export function onApiConfigChange(fn: (c: ApiConfig) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function buildUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

/**
 * One fetch wrapper for the whole app: injects the bearer token, unwraps the
 * engine's uniform error envelope, and broadcasts 401s so the shell can send
 * the operator back to the connect screen.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { token, baseUrl } = getApiConfig();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(baseUrl, path), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      `Cannot reach the engine at ${baseUrl || window.location.origin}. Is it running?`,
    );
  }

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("hookfire:unauthorized"));
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? safeJson(text) : undefined;

  if (!response.ok) {
    const envelope = data as ApiErrorBody | undefined;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? response.statusText ?? "Request failed",
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
