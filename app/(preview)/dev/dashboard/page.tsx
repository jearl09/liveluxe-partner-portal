import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Agenda } from "@/components/dashboard/agenda";
import { AttentionStrip } from "@/components/dashboard/attention-strip";
import { FreshnessPill } from "@/components/dashboard/freshness-pill";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { QuickSearch } from "@/components/dashboard/quick-search";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { demoActivity, demoRequests } from "@/lib/dashboard/demo";
import { buildAgenda, buildRequestRows, computeKpis, deriveAttention, evaluateFreshness } from "@/lib/domain/dashboard";
import { previewsAllowed } from "@/lib/preview";
import { formatTimestamp } from "@/lib/utils";

export const metadata = { title: "Dashboard preview", robots: { index: false } };

/**
 * DESIGN REVIEW ONLY — renders the partner dashboard with sample data and no session.
 * 404s unless previews are allowed (lib/preview.ts). Remove once Phase 3 provides real data and a seeded partner account.
 */
export default async function DashboardPreview({ searchParams }: PageProps<"/dev/dashboard">) {
  if (!previewsAllowed()) notFound();
  const p = await searchParams;
  const now = new Date();
  const fmt = { timestamp: (iso: string) => formatTimestamp(iso) };
  const empty = p.state === "empty";
  const rows = empty ? [] : demoRequests(now);
  const freshness = evaluateFreshness(
    p.state === "stale"
      ? new Date(now.getTime() - 90 * 60_000).toISOString()
      : new Date(now.getTime() - 3 * 60_000).toISOString(),
    now,
    30,
  );
  const kpis = computeKpis(rows, now);
  return (
    <AppShell
      tone="partner"
      sync={{ level: "live", lastConfirmedAt: new Date().toISOString(), ageMinutes: 2 }}
      supportEmail="contact@liveluxeau.com"
      nav={[
        { href: "/", label: "Dashboard" },
        { href: "/search", label: "Search" },
        { href: "/requests", label: "Requests" },
        { href: "/invoices", label: "Invoices" },
        { href: "/team", label: "Team" },
        { href: "/settings", label: "Settings" },
      ]}
      user={{
        name: "Dana Partner",
        email: "claudia@acme-insurance.example",
        role: "partner_admin",
        orgName: "Acme Insurance",
      }}
    >
      <div className="space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-1">Dashboard</p>
            <h1 className="text-strong font-serif text-3xl tracking-tight">Good afternoon, Claudia.</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Acme Insurance · {kpis.activePlacements} placements active · {kpis.pendingWithLivluxe} requests pending
            </p>
            <div className="mt-3">
              <FreshnessPill freshness={freshness} />
            </div>
          </div>
          <div className="flex gap-2">
            <a
              className="border-input text-strong bg-card h-11 rounded-md border px-4 py-2 text-sm font-medium"
              href="#"
            >
              New request on behalf of…
            </a>
            <a className="bg-primary text-primary-foreground h-11 rounded-md px-4 py-2 text-sm font-medium" href="#">
              Find a property
            </a>
          </div>
        </header>
        {freshness.state === "stale" && (
          <div role="alert" className="border-warn-border bg-warn-bg text-warn rounded-md border px-4 py-2 text-sm">
            Availability shown across the portal may be out of date. Quotes are re-checked before submission.
          </div>
        )}
        <AttentionStrip items={deriveAttention(rows, now, fmt)} />
        <KpiRow kpis={kpis} />
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <RequestsTable rows={buildRequestRows(rows, now, fmt)} firstTime={empty} />
          </div>
          <div className="space-y-6">
            <Agenda entries={buildAgenda(rows, now)} />
            <ActivityFeed events={empty ? [] : demoActivity(now, fmt.timestamp)} />
          </div>
        </div>
        <QuickSearch lastSuburb={empty ? null : "Docklands"} />
      </div>
    </AppShell>
  );
}
