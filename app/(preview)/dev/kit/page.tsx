import { notFound } from "next/navigation";
import AdminLoading from "@/app/(admin)/loading";
import { Trouble } from "@/components/layout/trouble";
import { Freshness } from "@/components/requests/freshness";
import { ListFilters } from "@/components/requests/list-filters";
import { ListPagination } from "@/components/ui/list-pagination";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/ui/submit-button";
import { FILTERABLE_BANDS, parseListParams, toPage } from "@/lib/domain/list-params";
import { previewsAllowed } from "@/lib/preview";
import { Banner } from "@/components/ui/banner";
import { fieldClasses, fieldErrorClass, labelClass } from "@/components/ui/field";
import { GroupLabel, Panel, PanelHeading, PanelSection } from "@/components/ui/panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Notice } from "@/components/auth/notice";
import { Flash } from "@/components/requests/flash";
import { RequestsTable } from "@/components/requests/requests-table";
import { StayCard } from "@/components/requests/stay-card";
import { QuoteLines } from "@/components/requests/quote-lines";
import { StatusTimeline } from "@/components/requests/status-timeline";
import { DecisionPanel } from "@/components/admin/decision-panel";
import { PartnerForm } from "@/components/admin/partner-form";
import { PeoplePanel } from "@/components/team/people-panel";
import { SearchForm } from "@/components/search/search-form";
import { Pagination } from "@/components/search/pagination";
import { BOOKING_STATUSES } from "@/lib/domain/booking-state-machine";
import type { BookingRequestRow } from "@/lib/db/types";
import type { HistoryEntry, RequestListItem } from "@/lib/requests/load";

export const metadata = { title: "Component kit", robots: { index: false } };

const now = new Date("2026-10-12T03:00:00Z");
const iso = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

const rows: RequestListItem[] = [
  {
    id: "1",
    reference: "LLX-2026-000412",
    status: "SUBMITTED",
    orgId: "o",
    orgName: "Acme Insurance",
    propertyName: "Marvel Tower 1507",
    suburb: "Docklands",
    checkIn: "2026-10-20",
    checkOut: "2026-11-20",
    nights: 31,
    guestName: "R. Whitfield",
    claimRef: "CLM-88213",
    poNumber: null,
    totalCents: 916920,
    currency: "AUD",
    submittedAt: iso(-3),
    decisionDueAt: iso(5),
    holdExpiresAt: iso(21),
    slaPaused: false,
    band: "on_track",
    updatedAt: iso(-1),
  },
  {
    id: "2",
    reference: "LLX-2026-000409",
    status: "UNDER_REVIEW",
    orgId: "o",
    orgName: "Suncorp Claims",
    propertyName: "La Trobe Residences 804",
    suburb: "Docklands",
    checkIn: "2026-10-24",
    checkOut: "2026-11-23",
    nights: 30,
    guestName: "A. Adeyemi",
    claimRef: null,
    poNumber: "PO-44817",
    totalCents: 884000,
    currency: "AUD",
    submittedAt: iso(-26),
    decisionDueAt: iso(1.5),
    holdExpiresAt: iso(10),
    slaPaused: false,
    band: "at_risk",
    updatedAt: iso(-2),
  },
  {
    id: "3",
    reference: "LLX-2026-000388",
    status: "COUNTER_OFFERED",
    orgId: "o",
    orgName: "Acme Insurance",
    propertyName: "Harbour One 2108",
    suburb: "Docklands",
    checkIn: "2026-10-17",
    checkOut: "2026-12-12",
    nights: 56,
    guestName: "J. Martínez",
    claimRef: "CLM-88104",
    poNumber: null,
    totalCents: 1512000,
    currency: "AUD",
    submittedAt: iso(-50),
    decisionDueAt: null,
    holdExpiresAt: iso(30),
    slaPaused: true,
    band: "paused",
    updatedAt: iso(-4),
  },
  {
    id: "4",
    reference: "LLX-2026-000371",
    status: "SUBMITTED",
    orgId: "o",
    orgName: "State Govt Housing",
    propertyName: "Harbour One 701",
    suburb: "Docklands",
    checkIn: "2026-10-30",
    checkOut: "2026-12-29",
    nights: 60,
    guestName: null,
    claimRef: null,
    poNumber: null,
    totalCents: null,
    currency: "AUD",
    submittedAt: iso(-40),
    decisionDueAt: iso(-3),
    holdExpiresAt: iso(2),
    slaPaused: false,
    band: "breached",
    updatedAt: iso(-1),
  },
];

const request: BookingRequestRow = {
  id: "1",
  reference: "LLX-2026-000412",
  org_id: "o",
  listing_id: "l",
  quote_id: "q",
  created_by: "u",
  on_behalf_of: false,
  assigned_to: null,
  status: "UNDER_REVIEW",
  check_in: "2026-10-20",
  check_out: "2026-11-20",
  nights: 31,
  guests_adults: 2,
  guests_children: 1,
  guests_pets: 0,
  guest_name: "Rebecca Whitfield",
  guest_email: "r.whitfield@example.com",
  guest_phone: "0412 000 000",
  claim_ref: "CLM-88213",
  po_number: null,
  cost_centre: "VIC-04",
  notes: "Ground floor or lift access please — guest is recovering from surgery.",
  total_cents: 916920,
  currency: "AUD",
  payment_mode: "net30",
  hold_expires_at: iso(21),
  decision_due_at: iso(5),
  sla_paused_at: null,
  sla_escalation_pct: 0,
  decline_reason: null,
  decline_notes: null,
  hostaway_reservation_id: null,
  hostaway_write_key: null,
  checkin_released_at: null,
  submitted_at: iso(-3),
  approved_at: null,
  approved_by: null,
  confirmed_at: null,
  declined_at: null,
  cancelled_at: null,
  cancellation_requested_at: null,
  cancellation_requested_by: null,
  cancellation_reason: null,
  cancel_refund_cents: null,
  cancel_retained_cents: null,
  created_at: iso(-3),
  updated_at: iso(-1),
};

const history: HistoryEntry[] = [
  {
    id: 1,
    from: null,
    to: "SUBMITTED",
    actorType: "partner",
    actorName: "Claudia Mendes",
    reason: null,
    metadata: null,
    at: iso(-3),
  },
  {
    id: 2,
    from: "SUBMITTED",
    to: "UNDER_REVIEW",
    actorType: "livluxe",
    actorName: "Sarah M.",
    reason: null,
    metadata: { message: "Checking the lift situation with the building manager." },
    at: iso(-1),
  },
];

const lines = [
  { kind: "accommodation" as const, label: "Accommodation (31 nights)", amountCents: 1069500 },
  { kind: "los_discount" as const, label: "Length-of-stay discount (15%)", amountCents: -160425 },
  { kind: "cleaning_fee" as const, label: "Cleaning fee", amountCents: 28000 },
  { kind: "tax" as const, label: "GST (10%)", amountCents: 93708 },
];

const people = [
  {
    id: "p1",
    auth_user_id: "me",
    org_id: "o",
    role: "partner_admin",
    email: "claudia@acme-insurance.example",
    full_name: "Claudia Mendes",
    status: "active" as const,
    mfa_enrolled: true,
    accepted_at: iso(-700),
    last_seen_at: iso(-0.2),
    created_at: iso(-700),
  },
  {
    id: "p2",
    auth_user_id: "u2",
    org_id: "o",
    role: "partner_booker",
    email: "t.nguyen@acme-insurance.example",
    full_name: "Tran Nguyen",
    status: "active" as const,
    mfa_enrolled: false,
    accepted_at: iso(-300),
    last_seen_at: iso(-30),
    created_at: iso(-300),
  },
  {
    id: "p3",
    auth_user_id: "u3",
    org_id: "o",
    role: "partner_viewer",
    email: "audit@acme-insurance.example",
    full_name: null,
    status: "disabled" as const,
    mfa_enrolled: false,
    accepted_at: iso(-500),
    last_seen_at: null,
    created_at: iso(-500),
  },
];
const invitations = [
  {
    id: "i1",
    org_id: "o",
    email: "new.booker@acme-insurance.example",
    role: "partner_booker",
    token_hash: "x",
    invited_by: "me",
    expires_at: iso(140),
    accepted_at: null,
    created_at: iso(-28),
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-serif text-xl">{title}</h2>
      {children}
    </section>
  );
}

/**
 * DESIGN REVIEW ONLY — every shared component with sample data and no session, in
 * whichever theme is active. 404s unless previews are allowed (lib/preview.ts); the
 * proxy only opens `/dev` under the same rule. `tests/e2e/kit.spec.ts` screenshots this
 * page in both themes at three widths, so a visual regression in any shared piece
 * fails CI before it reaches a partner.
 */
export default async function KitPage({ searchParams }: PageProps<"/dev/kit">) {
  if (!previewsAllowed()) notFound();
  const p = await searchParams;
  const tone = p.tone === "admin" ? "admin" : "partner";
  // ?throw=1 exercises the root error boundary (app/error.tsx) without a real failure.
  if (p.throw === "1") throw new Error("Deliberate preview error");
  return (
    <AppShell
      title="Partner portal"
      tone={tone}
      nav={[
        { href: "/", label: "Dashboard" },
        { href: "/search", label: "Search" },
        { href: "/requests", label: "Requests" },
        { href: "/team", label: "Team" },
        { href: "/settings", label: "Settings" },
      ]}
      user={{ email: "claudia@acme-insurance.example", role: "partner_admin", orgName: "Acme Insurance" }}
    >
      <div className="space-y-12">
        <PageHeader
          eyebrow="Design review"
          title="Component kit"
          description="Every shared piece, with sample data, in whichever theme is active."
          actions={
            <Button variant="outline" size="sm">
              Secondary
            </Button>
          }
        />

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="gold">Gold</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>

        <Section title="Status">
          <div className="flex flex-wrap gap-2">
            {BOOKING_STATUSES.map((s) => (
              <StatusPill key={s} status={s} />
            ))}
          </div>
          <div className="space-y-2">
            <Flash done="1" />
            <Flash error="PRICE_CHANGED" refCode="req_8f3a" />
            <Notice tone="info">Two-factor authentication is off.</Notice>
            <Notice tone="warn">Supabase is not configured.</Notice>
            <Notice tone="error">Email or password not recognised.</Notice>
            <Notice tone="success">Your password has been changed.</Notice>
          </div>
        </Section>

        <Section title="Search">
          <SearchForm
            query={{
              q: "Docklands",
              checkIn: "2026-10-20",
              checkOut: "2026-11-20",
              guests: 2,
              pets: 0,
              bedrooms: null,
              page: 1,
            }}
            today="2026-10-12"
          />
          <Pagination page={2} pages={5} hrefFor={(n) => `?page=${n}`} />
        </Section>

        <Section title="List filters, band pills, pagination, freshness">
          <div className="space-y-3">
            <ListFilters
              action="/dev/kit"
              params={parseListParams({ q: "LLX-2026", orgId: "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f" })}
              orgs={[
                { id: "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f", name: "Acme Insurance" },
                { id: "7f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f", name: "Suncorp Claims" },
              ]}
              clearHref="/dev/kit"
            />
            <ul className="flex flex-wrap items-center gap-2" aria-label="Filter by SLA band">
              {FILTERABLE_BANDS.map((band, i) => (
                <li key={band}>
                  <a
                    href="#"
                    aria-current={i === 0 ? "true" : undefined}
                    className={
                      "focus-visible:ring-ring ring-offset-background inline-flex rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none" +
                      (i === 0 ? " ring-primary ring-2 ring-offset-2" : "")
                    }
                  >
                    <Pill
                      tone={
                        band === "breached" ? "bad" : band === "at_risk" ? "warn" : band === "on_track" ? "ok" : "muted"
                      }
                      className="px-2.5 py-1"
                    >
                      {[2, 1, 7, 1][i]}{" "}
                      {band === "breached"
                        ? "overdue"
                        : band === "at_risk"
                          ? "at risk"
                          : band === "on_track"
                            ? "on track"
                            : "waiting on partner"}
                    </Pill>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <ListPagination
            page={toPage(rows, 63, 2, 25)}
            noun="request"
            hrefFor={(n) => `?page=${n}`}
            sizeHrefFor={(n) => `?pageSize=${n}`}
          />
          <Freshness renderedAt={new Date().toISOString()} />
        </Section>

        <Section title="Submit buttons (idle)">
          <div className="flex flex-wrap items-center gap-3">
            <form action="/dev/kit" method="get" className="contents">
              <SubmitButton variant="gold" pendingLabel="Approving…">
                Approve request
              </SubmitButton>
              <SubmitButton variant="outline" pendingLabel="Sending…">
                Send counter-offer
              </SubmitButton>
              <SubmitButton pendingLabel="Signing in…" disabled>
                Disabled
              </SubmitButton>
            </form>
          </div>
        </Section>

        <Section title="Not found / error">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <Trouble eyebrow="Not found" title="We couldn't find that" className="py-4 lg:py-4">
                <p>The link may be out of date, or the reference may belong to another organisation.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button">Your requests</Button>
                  <Button type="button" variant="outline">
                    Search availability
                  </Button>
                </div>
              </Trouble>
            </Panel>
            <Panel>
              <Trouble
                eyebrow="Something went wrong"
                title="This page couldn't load"
                refCode="a1b2c3d4"
                className="py-4 lg:py-4"
              >
                <p>It is on our side, not yours, and nothing you entered has been lost.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button">Try again</Button>
                  <Button type="button" variant="outline">
                    Dashboard
                  </Button>
                </div>
              </Trouble>
            </Panel>
          </div>
        </Section>

        <Section title="Loading skeleton (admin)">
          <AdminLoading />
        </Section>

        <Section title="Requests table — partner">
          <RequestsTable now={now} rows={rows} hrefFor={() => "#"} emptyTitle="" emptyHint="" />
        </Section>
        <Section title="Requests table — ops">
          <RequestsTable now={now} rows={rows} ops hrefFor={() => "#"} emptyTitle="" emptyHint="" />
        </Section>
        <Section title="Empty state">
          <RequestsTable
            now={now}
            rows={[]}
            hrefFor={() => "#"}
            emptyTitle="Nothing open right now"
            emptyHint="Search availability, price a stay and submit a request. It will track here."
          />
        </Section>

        <Section title="Request detail (admin layout)">
          <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8">
            <Panel flush className="divide-border divide-y" aria-label="Request details">
              <PanelSection className="py-4">
                <StayCard
                  plain
                  listing={{ name: "Marvel Tower 1507", suburb: "Docklands", state: "VIC", imageUrl: null }}
                  checkIn="2026-10-20"
                  checkOut="2026-11-20"
                  nights={31}
                  adults={2}
                  childGuests={1}
                  pets={0}
                />
              </PanelSection>
              <PanelSection>
                <GroupLabel className="mb-3">Partner and guest</GroupLabel>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground text-xs">Organisation</dt>
                    <dd className="text-strong">
                      Acme Insurance
                      <span className="text-muted-foreground block text-xs">Terms: invoice</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Guest</dt>
                    <dd className="text-strong">
                      R. Whitfield
                      <span className="text-muted-foreground block text-xs">
                        r.whitfield@example.com · 0400 000 000
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">References</dt>
                    <dd className="text-strong font-mono text-xs">Claim CLM-88213 · CC 4410</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Hostaway listing</dt>
                    <dd className="text-strong font-mono text-xs">123456</dd>
                  </div>
                </dl>
              </PanelSection>
              <PanelSection>
                <GroupLabel className="mb-3">Timeline</GroupLabel>
                <StatusTimeline history={history} showInternal />
              </PanelSection>
            </Panel>
            <div className="space-y-6">
              <DecisionPanel request={request} today="2026-10-12" paymentGate={{ ok: true }} />
              <Panel aria-labelledby="kit-quote">
                <PanelHeading id="kit-quote" title="Quote" className="mb-3" />
                <QuoteLines
                  lines={lines}
                  totalCents={1030783}
                  depositCents={50000}
                  currency="AUD"
                  nights={31}
                  compact
                />
              </Panel>
            </div>
          </div>
        </Section>

        <Section title="Banners (request detail)">
          <div className="space-y-3">
            <Banner tone="info">
              Live Luxe is reviewing this. Decision due by 13 Oct 2026, 11:00 am AEDT. Dates held for 22 h.
            </Banner>
            <Banner tone="success">
              <p className="font-medium">Approved</p>
              <p>
                The dates are reserved. Payment and confirmation follow next; check-in details are released 48 hours
                before arrival.
              </p>
            </Banner>
          </div>
        </Section>

        <Section title="Request form (with errors)">
          <div className="max-w-3xl space-y-4">
            <Banner tone="error">Please check Guest name, Claim reference. Nothing has been submitted yet.</Banner>
            <Panel flush className="divide-border divide-y">
              <PanelSection className="py-5">
                <GroupLabel className="mb-3">Guest</GroupLabel>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>
                    Guest name <span className="text-accent-ink">*</span>
                    <input aria-invalid className={fieldClasses(true)} defaultValue="" />
                    <span className={fieldErrorClass}>Enter the guest&apos;s name.</span>
                  </label>
                  <label className={labelClass}>
                    Guest email
                    <input className={fieldClasses()} defaultValue="r.whitfield@example.com" />
                  </label>
                  <label className={labelClass}>
                    Guest phone
                    <input className={fieldClasses()} />
                  </label>
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  Guest details are shared with Live Luxe only for this stay.
                </p>
              </PanelSection>
              <PanelSection className="py-5">
                <GroupLabel className="mb-3">Your references</GroupLabel>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className={labelClass}>
                    Claim reference <span className="text-accent-ink">*</span>
                    <input aria-invalid className={fieldClasses(true)} />
                    <span className={fieldErrorClass}>Your organisation requires a claim reference.</span>
                  </label>
                  <label className={labelClass}>
                    PO number
                    <input className={fieldClasses()} />
                  </label>
                  <label className={labelClass}>
                    Cost centre
                    <input className={fieldClasses()} defaultValue="4410" />
                  </label>
                </div>
                <label className={`${labelClass} mt-4`}>
                  Notes for Live Luxe
                  <textarea
                    rows={3}
                    className={fieldClasses()}
                    placeholder="Access needs, arrival time, anything the team should know"
                  />
                </label>
              </PanelSection>
              <PanelSection className="bg-muted/40 space-y-4 rounded-b-lg py-5">
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" />
                  <span className="text-foreground">
                    I confirm the stay details and the quoted total, and that this request is made under Acme
                    Insurance&apos;s agreement with Live Luxe. The dates are held for Live Luxe&apos;s decision; nothing
                    is charged until approval.
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="gold" className="w-full sm:w-auto">
                    Submit request
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    Live Luxe replies within the decision window; you can track it under Requests.
                  </span>
                </div>
              </PanelSection>
            </Panel>
          </div>
        </Section>

        <Section title="Team">
          <PeoplePanel
            action="#"
            users={people}
            invitations={invitations}
            roles={["partner_admin", "partner_booker", "partner_viewer", "partner_finance"]}
            currentUserAuthId="me"
            errorFields={new Set(["email"])}
            values={{ email: "not-an-email", role: "" }}
          />
        </Section>

        <Section title="Partner form (with errors)">
          <Panel className="max-w-xl" aria-labelledby="kit-new-partner">
            <PanelHeading id="kit-new-partner" title="New partner" />
            <PartnerForm
              action="#"
              values={{ name: "", type: "insurer", abn: "12 345", slaHours: "24" }}
              errorFields={new Set(["name", "abn"])}
              mode="create"
            />
          </Panel>
        </Section>
      </div>
    </AppShell>
  );
}
