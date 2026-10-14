import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Agenda } from "@/components/dashboard/agenda";
import { AttentionStrip } from "@/components/dashboard/attention-strip";
import { FreshnessPill } from "@/components/dashboard/freshness-pill";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { ManualSearch } from "@/components/dashboard/manual-search";
import { QuickSearch } from "@/components/dashboard/quick-search";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { SectionError } from "@/components/dashboard/section-error";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { getSessionClaims } from "@/lib/db/server";
import { loadDashboard } from "@/lib/dashboard/load";
import { env } from "@/lib/env";

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
          <h1 className="text-strong font-serif text-3xl tracking-tight">
            {d.greeting}, {d.firstName}.
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {d.orgName} · {d.summary.activePlacements} {d.summary.activePlacements === 1 ? "placement" : "placements"}{" "}
            active · {d.summary.pendingRequests} {d.summary.pendingRequests === 1 ? "request" : "requests"} pending
          </p>
          <div className="mt-3">
            <FreshnessPill freshness={d.freshness} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button asChild>
            <Link href={d.lastSuburb ? `/search?q=${encodeURIComponent(d.lastSuburb)}` : "/search"}>
              <Search className="h-4 w-4" aria-hidden /> Find a property
            </Link>
          </Button>
        </div>
      </header>

      {stale && (
        <div role="alert" className="border-warn-border bg-warn-bg text-warn rounded-md border px-4 py-2 text-sm">
          Availability shown across the portal may be out of date. Quotes are re-checked before submission.
        </div>
      )}

      {d.demo && (
        <p className="text-muted-foreground text-xs">
          Showing sample data for design review. Remove <span className="font-mono">?demo=1</span> to see your own.
        </p>
      )}

      {d.firstTime && <WelcomeCard supportEmail={env().EMAIL_REPLY_TO} />}

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

      {/* 6. Manual search: a quiet card, a real form (brief §7.2, §13 rule 10) */}
      <section
        aria-labelledby="manual-search-heading"
        className="bg-surface border-subtle rounded-card flex flex-wrap items-center justify-between gap-4 border px-5 py-5 print:hidden"
      >
        <div className="max-w-xl">
          <h2 id="manual-search-heading">Can&apos;t find the right property?</h2>
          <p className="text-text-secondary mt-1">
            Tell us the dates, suburb and household and the operations team will search for you.
          </p>
        </div>
        <ManualSearch to={env().EMAIL_REPLY_TO} orgName={d.orgName} />
      </section>

    </div>
  );
}
