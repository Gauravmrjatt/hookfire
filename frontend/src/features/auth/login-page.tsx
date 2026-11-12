import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, ExternalLink, KeyRound, Server, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Kbd } from "@/components/common/utils";
import { setApiConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

type ProbeState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "error"; detail: string };

function resolveBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, "") || window.location.origin;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [probe, setProbe] = useState<ProbeState>({ kind: "idle" });

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError("Paste the bearer token issued by the engine.");
      return;
    }
    setError("");
    setProbe({ kind: "testing" });

    try {
      const response = await fetch(`${resolveBase(baseUrl)}/v1/stats`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token.trim()}`,
        },
      });
      if (response.status === 401) {
        throw new Error("The engine rejected this token. Check JWT_SECRET and expiry.");
      }
      if (!response.ok) {
        throw new Error(`The engine answered ${response.status} ${response.statusText}.`);
      }
      setApiConfig({ baseUrl: baseUrl.trim(), token: token.trim() });
      navigate("/", { replace: true });
    } catch (cause) {
      setProbe({
        kind: "error",
        detail:
          cause instanceof Error
            ? cause.message
            : "Could not reach the engine at that address.",
      });
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <a
        href="#connect-form"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xs focus:bg-primary focus:px-4 focus:py-2 focus:text-xs focus:text-primary-foreground"
      >
        Skip to form
      </a>

      <header className="flex h-[48px] items-center gap-3 border-b border-line px-4 md:px-8">
        <span
          aria-hidden="true"
          className="flex size-[22px] items-center justify-center rounded-xs border border-line-strong bg-surface-strong text-[11px] font-semibold text-fg"
        >
          H
        </span>
        <span className="text-2xs font-semibold text-fg">Hookfire</span>
        <span className="text-2xs text-fg-muted">Activity console</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="grid w-full max-w-[920px] gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <section className="hidden flex-col justify-center gap-5 lg:flex" aria-labelledby="login-pitch">
            <div className="flex items-center gap-2">
              <Activity aria-hidden="true" className="size-[16px] text-accent-ink" />
              <span className="text-2xs font-medium text-fg-muted">Operator console</span>
            </div>
            <h1
              id="login-pitch"
              className="max-w-[24ch] text-md font-semibold tracking-[-0.02em] text-fg"
            >
              Watch every webhook attempt as it happens.
            </h1>
            <p className="max-w-[52ch] text-xs leading-[20px] text-fg-muted">
              Activity shows the live delivery feed, retry schedules, dead letters,
              and endpoint health. Connect with a bearer token minted by your
              engine — nothing is stored on a server.
            </p>
            <ul className="flex flex-col gap-3 text-2xs text-fg-muted">
              <li className="flex items-start gap-2">
                <ShieldCheck aria-hidden="true" className="mt-[2px] size-[13px] shrink-0 text-success" />
                The token stays in this browser's local storage.
              </li>
              <li className="flex items-start gap-2">
                <Server aria-hidden="true" className="mt-[2px] size-[13px] shrink-0 text-info" />
                Point at any engine: local, staging, or production.
              </li>
              <li className="flex items-start gap-2">
                <KeyRound aria-hidden="true" className="mt-[2px] size-[13px] shrink-0 text-fg-muted" />
                Rotate the token by disconnecting and reconnecting.
              </li>
            </ul>
          </section>

          <section
            aria-labelledby="connect-heading"
            className="mx-auto w-full max-w-[400px] rounded-xs border border-line bg-surface-raised/[0.35] p-8 lg:max-w-none"
          >
            <div className="mb-6 flex flex-col gap-1">
              <h1 id="connect-heading" className="text-sm font-semibold tracking-[-0.01em] text-fg">
                Connect to an engine
              </h1>
              <p className="text-2xs leading-[18px] text-fg-muted">
                The token is validated against <code className="font-mono">/v1/stats</code>{" "}
                before it is saved.
              </p>
            </div>

            <form id="connect-form" tabIndex={-1} onSubmit={connect} className="flex flex-col gap-5" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-base-url">API base URL</Label>
                <Input
                  id="login-base-url"
                  value={baseUrl}
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                    setProbe({ kind: "idle" });
                  }}
                  placeholder={window.location.origin}
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  autoFocus
                />
                <span className="text-2xs text-fg-muted">
                  Leave blank when the dashboard and engine share an origin.
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="login-token">Bearer token</Label>
                <Input
                  id="login-token"
                  type="password"
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value);
                    setProbe({ kind: "idle" });
                  }}
                  placeholder="eyJhbGciOiJIUzI1NiIs…"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error) || probe.kind === "error"}
                  aria-describedby="login-token-help"
                />
                <span id="login-token-help" className="text-2xs text-fg-muted">
                  HS256 JWT signed with the engine's{" "}
                  <code className="font-mono">JWT_SECRET</code>.
                </span>
                <FieldError>{error}</FieldError>
              </div>

              {probe.kind === "error" ? (
                <p
                  role="alert"
                  className="rounded-xs border border-danger/30 bg-danger/10 p-3 text-2xs leading-[18px] text-danger"
                >
                  {probe.detail}
                </p>
              ) : null}

              <Button
                type="submit"
                size="lg"
                loading={probe.kind === "testing"}
                className="w-full"
              >
                Connect
                <ArrowRight aria-hidden="true" />
              </Button>

              <p className={cn("text-center text-[10px] leading-[16px] text-fg-muted")}>
                Press <Kbd>Enter</Kbd> to connect.
              </p>
            </form>

            <div className="mt-6 flex flex-col gap-2 border-t border-line pt-4 text-2xs">
              <a
                href="https://github.com/Gauravmrjatt/hookfire#authentication"
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-2 rounded-xs text-accent-ink hover:underline"
              >
                How to mint a token
                <ExternalLink aria-hidden="true" className="size-[12px]" />
              </a>
              <a
                href="https://github.com/Gauravmrjatt/hookfire"
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-2 rounded-xs text-fg-muted hover:text-fg"
              >
                Source and documentation
                <ExternalLink aria-hidden="true" className="size-[12px]" />
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
