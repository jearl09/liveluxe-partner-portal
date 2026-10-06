import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Agenda } from "@/components/dashboard/agenda";
import { AttentionStrip } from "@/components/dashboard/attention-strip";
import { FreshnessPill } from "@/components/dashboard/freshness-pill";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { QuickSearch } from "@/components/dashboard/quick-search";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { SectionError } from "@/components/dashboard/section-error";
import { getSessionClaims } from "@/lib/db/server";
import { loadDashboard } from "@/lib/dashboard/load";

export const metadata = { title: "Dashboard" };

/**
 * Partner dashboard (§13.1 "/"). An operational landing page: what is waiting on me, what is
 * waiting on Live Luxe, who arrives or leaves this week. Each section loads independently;
 * a failure shows an inline card with a support reference, never a raw error.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const params = await searchParams;
  const d = await loadDashboard(claims, { demo: params.demo === "1" });
  const stale = d.freshness.state === "stale";

  return (
    <div className="space-y-8">
      {/* 1. Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Dashboard</p>
          <h1 className="text-navy-900 font-serif text-3xl tracking-tight">
            {d.greeting}, {d.firstName}.
          </h1>
          <p className="text-ink-500 mt-1 text-sm">
            {d.orgName} · {d.summary.activePlacements} {d.summary.activePlacements === 1 ? "placement" : "placements"}{" "}
            active · {d.summary.pendingRequests} {d.summary.pendingRequests === 1 ? "request" : "requests"} pending
          </p>
          <div className="mt-3">
            <FreshnessPill freshness={d.freshness} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {d.canBook && (
            <Button asChild variant="outline">
              <Link href="/requests/new?onBehalf=1">
                <UserPlus className="h-4 w-4" aria-hidden /> New request on behalf of…
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href={d.lastSuburb ? `/search?q=${encodeURIComponent(d.lastSuburb)}` : "/search"}>
              <Search className="h-4 w-4" aria-hidden /> Find a property
            </Link>
          </Button>
        </div>
      </header>

      {stale && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Availability shown across the portal may be out of date. Quotes are re-checked before submission.
        </div>
      )}

      {d.demo && (
        <p className="text-ink-500 text-xs">
          Showing sample data for design review. Remove <span className="font-mono">?demo=1</span> to see your own.
        </p>
      )}

      {/* 2. Needs your attention (renders only when non-empty) */}
      {d.attention.ok ? <AttentionStrip items={d.attention.data} /> : null}

      {/* 3. KPIs */}
      {d.kpis.ok ? <KpiRow kpis={d.kpis.data} /> : <SectionError what="summary" refCode={d.kpis.ref} />}

      {/* 4. Main area */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {d.requests.ok ? (
            <RequestsTable rows={d.requests.data} firstTime={d.firstTime} />
          ) : (
            <SectionError what="requests" refCode={d.requests.ref} />
          )}
        </div>
        <div className="space-y-6 print:hidden">
          {d.agenda.ok ? <Agenda entries={d.agenda.data} /> : <SectionError what="week" refCode={d.agenda.ref} />}
          {d.activity.ok ? (
            <ActivityFeed events={d.activity.data} />
          ) : (
            <SectionError what="recent activity" refCode={d.activity.ref} />
          )}
        </div>
      </div>

      {/* 5. Quick search */}
      <div className="print:hidden">
        <QuickSearch lastSuburb={d.lastSuburb} />
      </div>

      {/* 6. Manual search fallback — below the fold on purpose */}
      <section className="bg-navy-900 rounded-lg px-6 py-7 text-white md:px-8 print:hidden">
        <p className="eyebrow mb-1">Fallback</p>
        <h2 className="font-serif text-xl text-white">Can&apos;t find the right property?</h2>
        <p className="mt-1 max-w-xl text-sm text-white/80">
          Tell us the dates, suburb and household and the operations team will run a manual search.
        </p>
        <Button asChild variant="gold" size="sm" className="mt-4">
          <Link href="/requests/new?manual=1">Request a manual search</Link>
        </Button>
      </section>

      {/* Phone: sticky search shortcut */}
      <Link
        href="/search"
        className="bg-navy-900 fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white shadow-lg md:hidden print:hidden"
      >
        <Search className="h-4 w-4" aria-hidden /> Search
      </Link>
    </div>
  );
}
