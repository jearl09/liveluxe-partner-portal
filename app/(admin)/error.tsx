"use client";

import { ErrorView } from "@/components/layout/error-view";

/** Errors inside an ops page; the console chrome stays up. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} home={{ href: "/admin/queue", label: "Back to the queue" }} />;
}
