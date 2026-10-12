"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 60_000;

function relative(ms: number): string {
  if (ms < 10_000) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)} s ago`;
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine);
/** A coarse clock the label can subscribe to (ms, 15 s resolution); the server snapshot (0) means "render time". */
const tickNow = () => Math.floor(Date.now() / 15_000) * 15_000;
function subscribeTick(cb: () => void) {
  const t = window.setInterval(cb, 15_000);
  return () => window.clearInterval(t);
}
function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * "Updated 2 min ago" with a refresh button, for lists that go stale while an
 * operator watches them. Refreshes through the router (a server re-render of this
 * page, nothing else) once a minute while the tab is visible, at once when the tab
 * comes back, and never while a refresh is already in flight. `renderedAt` is the
 * server's clock at render, so the label is right from the first paint.
 */
export function Freshness({ renderedAt, className }: { renderedAt: string; className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isOnline = useSyncExternalStore(subscribeOnline, online, () => true);
  const tick = useSyncExternalStore(subscribeTick, tickNow, () => 0);
  const since = new Date(renderedAt).getTime();
  // The label ticks every 15 s; the data only moves when the router refreshes.
  const now = tick === 0 ? since : tick;

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      startTransition(() => router.refresh());
    };
    const t = window.setInterval(refresh, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - since > INTERVAL_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, since]);

  const age = Math.max(0, now - since);
  return (
    <p
      className={cn("text-muted-foreground flex items-center gap-2 text-xs print:hidden", className)}
      aria-live="polite"
      data-live="freshness"
    >
      {!isOnline ? (
        <span className="text-warn">Offline — showing the queue from {relative(age)}</span>
      ) : isPending ? (
        <span>Refreshing…</span>
      ) : (
        <span>
          Updated{" "}
          <time dateTime={renderedAt} title={new Date(renderedAt).toLocaleString("en-AU")}>
            {relative(age)}
          </time>
        </span>
      )}
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending || !isOnline}
        className="hover:text-strong focus-visible:ring-ring ease-ios inline-flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        aria-label="Refresh now"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} aria-hidden />
        Refresh
      </button>
    </p>
  );
}
