"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Trouble } from "@/components/layout/trouble";
import { Button } from "@/components/ui/button";

/**
 * Body of every error boundary. Next passes a sanitised `error` to client boundaries:
 * in production the message is replaced and only `digest` survives, which is the
 * same ID the server log carries — so it is the one thing worth showing the user.
 * Nothing else about the failure is printed here, by design.
 */
export function ErrorView({
  error,
  reset,
  home,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  home: { href: string; label: string };
}) {
  useEffect(() => {
    // The server already logged it; this keeps the digest findable from the browser console too.
    console.error("[portal] render error", error.digest ?? "(no digest)");
  }, [error]);

  return (
    <Trouble eyebrow="Something went wrong" title="This page couldn't load" refCode={error.digest ?? null}>
      <p>
        It is on our side, not yours, and nothing you entered has been lost. Try again in a moment; if it keeps
        happening, let Live Luxe know.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => reset()}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </Button>
        <Button asChild variant="outline">
          <Link href={home.href}>{home.label}</Link>
        </Button>
      </div>
    </Trouble>
  );
}
