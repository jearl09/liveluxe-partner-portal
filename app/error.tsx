"use client";

import { Wordmark } from "@/components/layout/brand";
import { ErrorView } from "@/components/layout/error-view";

/** Errors thrown outside a signed-in shell (or by a shell's own layout). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="bg-background flex min-h-screen flex-col px-4 py-6 md:px-6">
      <header>
        <Wordmark descriptor="Partner portal" />
      </header>
      <main className="flex flex-1 items-center">
        <ErrorView error={error} reset={reset} home={{ href: "/", label: "Back to the portal" }} />
      </main>
    </div>
  );
}
