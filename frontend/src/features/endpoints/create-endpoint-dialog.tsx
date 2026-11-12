import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Plus, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { CopyButton } from "@/components/common/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useCreateEndpoint } from "@/hooks/queries";
import type { Endpoint } from "@/types/api";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(200, "Name must be 200 characters or fewer."),
  url: z
    .string()
    .trim()
    .min(1, "URL is required.")
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "Enter an absolute http(s) URL."),
  rate_limit: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d+$/.test(value), "Use a whole number.")
    .refine((value) => value === "" || Number(value) <= 10_000, "Maximum is 10,000 per second."),
});

type Errors = Partial<Record<"name" | "url" | "rate_limit", string>>;

export function CreateEndpointDialog({
  open,
  onOpenChange,
  defaultUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultUrl?: string;
}) {
  const createEndpoint = useCreateEndpoint();
  const [name, setName] = useState("");
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [rateLimit, setRateLimit] = useState("100");
  const [secret, setSecret] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [created, setCreated] = useState<(Endpoint & { secret?: string }) | null>(null);
  const [revealed, setRevealed] = useState(false);

  function reset() {
    setName("");
    setUrl(defaultUrl ?? "");
    setRateLimit("100");
    setSecret("");
    setErrors({});
    setCreated(null);
    setRevealed(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = schema.safeParse({ name, url, rate_limit: rateLimit });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Errors;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});

    createEndpoint.mutate(
      {
        name: parsed.data.name,
        url: parsed.data.url,
        rate_limit: parsed.data.rate_limit === "" ? 0 : Number(parsed.data.rate_limit),
        secret: secret.trim() || undefined,
      },
      {
        onSuccess: (endpoint) => {
          setCreated(endpoint);
          setRevealed(true);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-[560px]">
        {created ? (
          <>
            <DialogHeader>
              <div className="mb-2 flex size-[32px] items-center justify-center rounded-xs border border-success/30 bg-success/10">
                <Check aria-hidden="true" className="size-[15px] text-success" />
              </div>
              <DialogTitle>Endpoint registered</DialogTitle>
              <DialogDescription>
                Copy the signing secret now. For safety it is stored hashed from
                the operator's perspective and will not be shown again.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 rounded-xs border border-line bg-surface p-4">
                <span className="text-2xs text-fg-muted">Name</span>
                <span className="text-xs text-fg">{created.name}</span>
                <span className="mt-2 text-2xs text-fg-muted">Endpoint id</span>
                <span className="break-all font-mono text-2xs text-fg-subtle">
                  {created.id}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="signing-secret">Signing secret</Label>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xs border border-line-strong bg-surface px-4">
                    <KeyRound aria-hidden="true" className="size-[13px] shrink-0 text-fg-muted" />
                    <code className="truncate font-mono text-2xs text-fg">
                      {revealed ? created.secret : "•".repeat(32)}
                    </code>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setRevealed((value) => !value)}
                    aria-label={revealed ? "Hide signing secret" : "Reveal signing secret"}
                  >
                    {revealed ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                  </Button>
                  <CopyButton value={created.secret ?? ""} label="Copy signing secret" />
                </div>
                <p className="flex items-start gap-2 text-2xs leading-[18px] text-fg-muted">
                  <ShieldCheck aria-hidden="true" className="mt-[2px] size-[13px] shrink-0" />
                  Subscribers verify with HMAC-SHA256 over
                  <code className="font-mono">timestamp.body</code>. Store it in your
                  subscriber's environment.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                <Plus aria-hidden="true" />
                Register another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Register endpoint</DialogTitle>
              <DialogDescription>
                Every active endpoint receives one delivery per accepted event.
                The URL is validated by the engine and blocked from private
                networks unless explicitly allowed.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="endpoint-name">Name</Label>
                <Input
                  id="endpoint-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="billing-service"
                  aria-invalid={Boolean(errors.name)}
                  autoComplete="off"
                />
                <FieldError>{errors.name}</FieldError>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="endpoint-url">Webhook URL</Label>
                <Input
                  id="endpoint-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/webhooks/hookfire"
                  aria-invalid={Boolean(errors.url)}
                  inputMode="url"
                  autoComplete="off"
                />
                <span className="text-2xs text-fg-muted">
                  http or https · private and loopback addresses are rejected.
                </span>
                <FieldError>{errors.url}</FieldError>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="endpoint-rate">Rate limit (per second)</Label>
                  <Input
                    id="endpoint-rate"
                    value={rateLimit}
                    onChange={(event) => setRateLimit(event.target.value)}
                    inputMode="numeric"
                    aria-invalid={Boolean(errors.rate_limit)}
                  />
                  <span className="text-2xs text-fg-muted">0 uses the engine default.</span>
                  <FieldError>{errors.rate_limit}</FieldError>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="endpoint-secret">Secret (optional)</Label>
                  <Input
                    id="endpoint-secret"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    placeholder="auto-generated"
                    type="password"
                    autoComplete="new-password"
                  />
                  <span className="text-2xs text-fg-muted">
                    Leave blank to generate a 256-bit secret.
                  </span>
                </div>
              </div>

              <DialogFooter className="mt-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={createEndpoint.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={createEndpoint.isPending}>
                  Register endpoint
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
