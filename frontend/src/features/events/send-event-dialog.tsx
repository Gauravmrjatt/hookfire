import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dices, Send } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { useCreateEvent } from "@/hooks/queries";
import { newIdempotencyKey } from "@/lib/format";

const schema = z.object({
  event_type: z
    .string()
    .trim()
    .min(1, "Event type is required.")
    .max(200, "Event type must be 200 characters or fewer."),
  payload: z
    .string()
    .trim()
    .min(1, "Payload is required.")
    .refine((value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }, "Payload must be valid JSON."),
  key: z
    .string()
    .trim()
    .min(1, "Idempotency key is required.")
    .max(256, "Idempotency key must be 256 characters or fewer."),
});

const SAMPLE = JSON.stringify(
  {
    payment_id: "pay_123",
    amount: 5000,
    currency: "usd",
    status: "completed",
  },
  null,
  2,
);

type Errors = Partial<Record<"event_type" | "payload" | "key", string>>;

export function SendEventDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const createEvent = useCreateEvent();

  const [eventType, setEventType] = useState("payment.completed");
  const [payload, setPayload] = useState(SAMPLE);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (open) {
      setKey(newIdempotencyKey());
      setErrors({});
    }
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = schema.safeParse({ event_type: eventType, payload, key });
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

    createEvent.mutate(
      {
        key: parsed.data.key,
        body: {
          event_type: parsed.data.event_type,
          payload: JSON.parse(parsed.data.payload),
        },
      },
      {
        onSuccess: (created) => {
          onOpenChange(false);
          navigate(`/events/${created.id}`);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Send test event</DialogTitle>
          <DialogDescription>
            The event is committed with one delivery per active endpoint before
            this call returns. Reusing the same idempotency key returns the
            original event instead of creating a duplicate.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-type">Event type</Label>
              <Input
                id="event-type"
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
                placeholder="payment.completed"
                aria-invalid={Boolean(errors.event_type)}
                aria-describedby={errors.event_type ? "event-type-error" : undefined}
                autoComplete="off"
              />
              <span id="event-type-error">
                <FieldError>{errors.event_type}</FieldError>
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="idempotency-key">Idempotency key</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="idempotency-key"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  className="font-mono"
                  aria-invalid={Boolean(errors.key)}
                  aria-describedby="idempotency-help"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setKey(newIdempotencyKey())}
                  aria-label="Generate a new idempotency key"
                >
                  <Dices aria-hidden="true" />
                </Button>
              </div>
              <span id="idempotency-help" className="text-2xs text-fg-muted">
                Sent as the <code className="font-mono">Idempotency-Key</code> header.
              </span>
              <FieldError>{errors.key}</FieldError>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="payload">Payload (JSON)</Label>
            <Textarea
              id="payload"
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              rows={10}
              spellCheck={false}
              aria-invalid={Boolean(errors.payload)}
              aria-describedby={errors.payload ? "payload-error" : undefined}
            />
            <span id="payload-error">
              <FieldError>{errors.payload}</FieldError>
            </span>
          </div>

          <DialogFooter className="mt-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={createEvent.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={createEvent.isPending}>
              <Send aria-hidden="true" />
              Send event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
