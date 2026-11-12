import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Database,
  ExternalLink,
  KeyRound,
  Keyboard,
  LogOut,
  Server,
  Trash2,
  XCircle,
} from "lucide-react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Kbd } from "@/components/common/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { clearApiConfig, getApiConfig, setApiConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

type ProbeState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; detail: string }
  | { kind: "error"; detail: string };

const SHORTCUTS = [
  { keys: ["⌘", "K"], action: "Open command palette" },
  { keys: ["?"], action: "Open command palette" },
  { keys: ["Esc"], action: "Close dialog, sheet, or menu" },
  { keys: ["Tab"], action: "Move to the next control" },
  { keys: ["Shift", "Tab"], action: "Move to the previous control" },
  { keys: ["↑", "↓"], action: "Move through menu and palette items" },
  { keys: ["Enter"], action: "Activate the focused control" },
  { keys: ["Space"], action: "Toggle a switch or select a row" },
];

function resolveBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, "") || window.location.origin;
}

async function probe(baseUrl: string, token: string) {
  const response = await fetch(`${resolveBase(baseUrl)}/v1/stats`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    throw new Error("The engine rejected this token. Mint a fresh JWT and try again.");
  }
  if (!response.ok) {
    throw new Error(`The engine answered ${response.status} ${response.statusText}.`);
  }
  const body = (await response.json()) as { queue_depth?: number; deliveries_total?: number };
  return `Connected. ${body.deliveries_total ?? 0} deliveries tracked, queue depth ${body.queue_depth ?? 0}.`;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const initial = getApiConfig();

  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [token, setToken] = useState(initial.token);
  const [probeState, setProbeState] = useState<ProbeState>({ kind: "idle" });
  const [error, setError] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  useEffect(() => {
    setBaseUrl(getApiConfig().baseUrl);
    setToken(getApiConfig().token);
  }, []);

  async function testConnection() {
    if (!token.trim()) {
      setProbeState({ kind: "error", detail: "A bearer token is required to reach the engine." });
      return;
    }
    setProbeState({ kind: "testing" });
    try {
      const detail = await probe(baseUrl, token.trim());
      setProbeState({ kind: "ok", detail });
    } catch (cause) {
      setProbeState({
        kind: "error",
        detail: cause instanceof Error ? cause.message : "The connection test failed.",
      });
    }
  }

  function save() {
    if (!token.trim()) {
      setError("A bearer token is required.");
      return;
    }
    setError("");
    setApiConfig({ baseUrl: baseUrl.trim(), token: token.trim() });
    navigate("/", { replace: true });
  }

  const dirty = baseUrl.trim() !== initial.baseUrl || token.trim() !== initial.token;

  return (
    <>
      <PageHeader
        title="Settings"
        description="This dashboard is a client of the engine, not the engine itself. Connection details live in this browser's local storage and are never sent anywhere except the configured API base URL."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-8">
            <div className="mb-2 flex items-center gap-2">
              <Server aria-hidden="true" className="size-[14px] text-fg-muted" />
              <h2 className="text-xs font-semibold text-fg">Connection</h2>
            </div>
            <p className="mb-5 max-w-[72ch] text-2xs leading-[18px] text-fg-muted">
              Leave the base URL blank to use the origin this dashboard was served
              from — the recommended setup, where a reverse proxy serves both the
              dashboard and <code className="font-mono">/v1</code>. Set an explicit
              URL only when the engine lives on another host.
            </p>

            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
              noValidate
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="settings-base-url">API base URL</Label>
                <Input
                  id="settings-base-url"
                  value={baseUrl}
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                    setProbeState({ kind: "idle" });
                  }}
                  placeholder="https://hookfire.internal"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                />
                <span className="text-2xs text-fg-muted">
                  Currently resolving to{" "}
                  <code className="font-mono text-fg-subtle">{resolveBase(baseUrl)}</code>
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="settings-token">Bearer token</Label>
                <Input
                  id="settings-token"
                  type="password"
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value);
                    setProbeState({ kind: "idle" });
                  }}
                  placeholder="eyJhbGciOiJIUzI1NiIs…"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby="settings-token-help"
                />
                <span id="settings-token-help" className="text-2xs text-fg-muted">
                  Paste a JWT signed with the engine's{" "}
                  <code className="font-mono">JWT_SECRET</code>. The token is kept
                  in this browser only.
                </span>
                <FieldError>{error}</FieldError>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={!dirty && !error}>
                  Save and reconnect
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void testConnection()}
                  loading={probeState.kind === "testing"}
                >
                  Test connection
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setBaseUrl(initial.baseUrl);
                    setToken(initial.token);
                    setProbeState({ kind: "idle" });
                    setError("");
                  }}
                  disabled={!dirty}
                >
                  Reset changes
                </Button>
              </div>

              {probeState.kind === "ok" || probeState.kind === "error" ? (
                <p
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "flex items-start gap-2 rounded-xs border p-3 text-2xs leading-[18px]",
                    probeState.kind === "ok"
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-danger/30 bg-danger/10 text-danger",
                  )}
                >
                  {probeState.kind === "ok" ? (
                    <CheckCircle2 aria-hidden="true" className="mt-[2px] size-[13px] shrink-0" />
                  ) : (
                    <XCircle aria-hidden="true" className="mt-[2px] size-[13px] shrink-0" />
                  )}
                  {probeState.detail}
                </p>
              ) : null}
            </form>
          </Card>

          <Card className="p-8">
            <div className="mb-2 flex items-center gap-2">
              <Keyboard aria-hidden="true" className="size-[14px] text-fg-muted" />
              <h2 className="text-xs font-semibold text-fg">Keyboard</h2>
            </div>
            <p className="mb-4 text-2xs text-fg-muted">
              Every action is reachable without a pointer. Focus is always visible.
            </p>
            <dl className="flex flex-col">
              {SHORTCUTS.map((shortcut) => (
                <div
                  key={`${shortcut.action}:${shortcut.keys.join("+")}`}
                  className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-0"
                >
                  <dt className="text-2xs text-fg-muted">{shortcut.action}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-8">
            <div className="mb-2 flex items-center gap-2">
              <Database aria-hidden="true" className="size-[14px] text-fg-muted" />
              <h2 className="text-xs font-semibold text-fg">Local data</h2>
            </div>
            <p className="mb-5 max-w-[72ch] text-2xs leading-[18px] text-fg-muted">
              The dashboard stores exactly two values in this browser: the API base
              URL and the bearer token. Charts and counters are derived from live
              polling and are discarded when the tab closes.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setDisconnectOpen(true)}
                disabled={!getApiConfig().token}
              >
                <LogOut aria-hidden="true" />
                Disconnect
              </Button>
              <Button variant="danger" onClick={() => setClearOpen(true)}>
                <Trash2 aria-hidden="true" />
                Clear stored settings
              </Button>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-8">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound aria-hidden="true" className="size-[14px] text-fg-muted" />
              <h2 className="text-xs font-semibold text-fg">Mint a token</h2>
            </div>
            <p className="text-2xs leading-[18px] text-fg-muted">
              Tokens are HS256 JWTs signed with the engine's{" "}
              <code className="font-mono text-fg-subtle">JWT_SECRET</code>. Use the
              Makefile target or the helper in the repository:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xs border border-line bg-surface p-4 font-mono text-2xs leading-[18px] text-fg-subtle">
              <code>{`JWT_SECRET=… make token`}</code>
            </pre>
          </Card>

          <Card className="p-8">
            <h2 className="mb-3 text-xs font-semibold text-fg">About</h2>
            <dl className="flex flex-col gap-3 text-2xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-muted">Product</dt>
                <dd className="text-fg">Hookfire Activity</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-muted">Version</dt>
                <dd>
                  <Badge tone="neutral" shape="mono">
                    {__APP_VERSION__}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-muted">Engine</dt>
                <dd className="truncate font-mono text-fg-subtle">{resolveBase(baseUrl)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-muted">Delivery model</dt>
                <dd className="text-fg">At least once</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
              <a
                href="https://github.com/Gauravmrjatt/hookfire"
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-2 rounded-xs text-2xs text-accent-ink hover:underline"
              >
                Source and documentation
                <ExternalLink aria-hidden="true" className="size-[12px]" />
              </a>
              <a
                href="/metrics"
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-2 rounded-xs text-2xs text-accent-ink hover:underline"
              >
                Prometheus metrics
                <ExternalLink aria-hidden="true" className="size-[12px]" />
              </a>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear stored settings?"
        description="The API base URL and bearer token are removed from this browser. You will be returned to the connect screen."
        confirmLabel="Clear settings"
        destructive
        onConfirm={() => {
          clearApiConfig();
          navigate("/login", { replace: true });
        }}
      />

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Disconnect from the engine?"
        description="The token is removed from this browser. The engine keeps running and delivery is unaffected."
        confirmLabel="Disconnect"
        onConfirm={() => {
          setApiConfig({ token: "" });
          navigate("/login", { replace: true });
        }}
      />
    </>
  );
}
