import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <span className="rounded-xs border border-line bg-surface-raised/60 p-4">
        <Compass aria-hidden="true" className="size-[18px] text-fg-muted" />
      </span>
      <p className="font-mono text-2xs text-fg-muted">404</p>
      <h1 className="text-md font-semibold tracking-[-0.02em] text-fg">
        This page does not exist
      </h1>
      <p className="max-w-[52ch] text-2xs leading-[18px] text-fg-muted">
        The address may be mistyped, or the view may have moved. The delivery feed
        is always available from Activity.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Back to Activity
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/events">Browse events</Link>
        </Button>
      </div>
    </div>
  );
}
