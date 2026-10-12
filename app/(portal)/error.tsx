"use client";

import { ErrorView } from "@/components/layout/error-view";

/** Errors inside a partner page; the header and nav stay, so the user is never stranded. */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} home={{ href: "/", label: "Dashboard" }} />;
}
