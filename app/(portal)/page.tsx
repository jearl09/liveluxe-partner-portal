import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SyncState } from "@/components/ui/states";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Agenda } from "@/components/dashboard/agenda";
import { AttentionStrip } from "@/components/dashboard/attention-strip";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { ManualSearch } from "@/components/dashboard/manual-search";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { SectionError } from "@/components/dashboard/section-error";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { SearchForm } from "@/components/search/search-form";
import { getSessionClaims } from "@/lib/db/server";
import { loadDashboard } from "@/lib/dashboard/load";
import { todayIn } from "@/lib/domain/dates";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

/**
 * Partner dashboard (brief §7.2): is anything waiting on me, and what is coming up.
 * Greeting, then what needs the partner's action, then the search bar, the numbers,
 * the requests in progress with this week beside them, and the manual search card.
 * Each section loads on its own; a failure shows an inline card with a support
 * reference, never a raw error.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const params = await searchParams;
  const d = await loadDashboard(claims, { demo: params.demo === "1" });
  const degraded = d.sync.level === "degraded";
  const today = todayIn("Australia/Melbourne");

  return (
    <div className="space-y-8">
      <header className="relative isolate flex flex-wrap items-end justify-between gap-4">
        <div
          aria-hidden
          className="page-glow pointer-events-none absolute -top-8 left-1/2 -z-10 h-64 w-screen -translate-x-1/2 print:hidden"
        />
        <div className="min-w-0">
          <h1 className="text-h1 text-text-primary font-serif tracking-tight">
            {d.greeting}, {d.firstName}.
          </h1>
          <p className="text-text-secondary text-body mt-1">{d.orgName}</p>
        </div>
        {d.canBook && (
          <Link
            href={d.lastSuburb ? `/search?q=${encodeURIComponent(d.lastSuburb)}` : "/search"}
            className={cn(buttonVariants({ variant: "secondary" }), "w-full sm:w-auto print:hidden")}
          >
            <Search className="h-4 w-4" aria-hidden /> Find a property
          </Link>
        )}
      </header>

      {degraded && (
        <div
          role="status"
          className="border-attention-border bg-attention-bg text-text-primary rounded-card flex gap-3 border px-4 py-3"
        >
          <AlertTriangle className="text-attention-fg mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            Live availability is temporarily unavailable. Search shows what we last confirmed, and every request is
            re-checked before Live Luxe approves it.
          </p>
        </div>
      )}

      {d.demo && (
        <p className="text-text-muted text-body-sm">
          Showing sample data for design review. Remove <span className="font-mono">?demo=1</span> to see your own.
        </p>
      )}

      {d.firstTime && <WelcomeCard supportEmail={env().EMAIL_REPLY_TO} />}

      {d.attention.ok ? <AttentionStrip items={d.attention.data} /> : null}

      {d.canBook && (
        <section
          aria-labelledby="search-heading"
          className="border-subtle bg-surface rounded-card border p-5 print:hidden"
        >
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="search-heading">Find a property</h2>
            {!degraded && <SyncState model={d.sync} audience="partner" />}
          </div>
          {/* One gold action per view: the first "Needs your action" item when there is one, else Search. */}
          <SearchForm
            compact
            quiet={d.attention.ok && d.attention.data.length > 0}
            today={today}
            query={{ q: d.lastSuburb ?? "", checkIn: null, checkOut: null, guests: 2, pets: 0, bedrooms: null }}
          />
        </section>
      )}

      {d.kpis.ok ? <KpiRow kpis={d.kpis.data} /> : <SectionError what="summary" refCode={d.kpis.ref} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
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
