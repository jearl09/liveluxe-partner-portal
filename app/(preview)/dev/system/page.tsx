import { notFound } from "next/navigation";
import { AlertTriangle, Inbox, Search } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateField, DateRangeField } from "@/components/ui/date-field";
import { ConfirmDialog, Sheet, SheetForm } from "@/components/ui/dialog";
import { HelpTip } from "@/components/ui/help-tip";
import { EmptyState, ErrorState, SyncState } from "@/components/ui/states";
import { StepTracker } from "@/components/ui/step-tracker";
import { Toast } from "@/components/ui/toast";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { ManualSearch } from "@/components/dashboard/manual-search";
import { requestProgress, syncState } from "@/lib/domain/progress";
import { Pill } from "@/components/ui/pill";
import { SlaBadge } from "@/components/ui/sla-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { SubmitButton } from "@/components/ui/submit-button";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/domain/booking-state-machine";
import { formatMoney } from "@/lib/domain/money";
import { previewsAllowed } from "@/lib/preview";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Design system", robots: { index: false } };

/**
 * /dev/system — every Phase 1 primitive in every state, both themes (brief §12.2).
 * Dev and preview only; 404 in production. Screenshotted into docs/ux/after/dev-system/.
 */

const NOW = new Date("2026-10-14T03:00:00Z");
const iso = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const ROLES: { name: string; cls: string; text?: string; note: string }[] = [
  { name: "bg/canvas", cls: "bg-canvas", note: "page" },
  { name: "bg/surface", cls: "bg-surface", note: "cards, tables, sheets" },
  { name: "bg/surface-raised", cls: "bg-surface-raised shadow-md", note: "popovers, dialogs" },
  { name: "bg/inset", cls: "bg-inset", note: "inputs, wells" },
  { name: "border/subtle", cls: "bg-surface border-2 border-subtle", note: "dividers" },
  { name: "border/strong", cls: "bg-surface border-2 border-strong-border", note: "inputs, focus" },
  { name: "text/primary", cls: "bg-surface text-text-primary", text: "Aa", note: "≥ 7:1" },
  { name: "text/secondary", cls: "bg-surface text-text-secondary", text: "Aa", note: "≥ 4.5:1" },
  { name: "text/muted", cls: "bg-surface text-text-muted", text: "Aa", note: "≥ 4.5:1" },
  { name: "accent/gold", cls: "bg-gold text-on-gold", text: "Aa", note: "one action per view" },
  { name: "accent/gold-hover", cls: "bg-gold-hover text-on-gold", text: "Aa", note: "" },
  { name: "text/gold", cls: "bg-surface text-text-gold", text: "Aa", note: "eyebrow, active nav" },
  { name: "focus/ring", cls: "bg-surface outline-2 outline-offset-2 outline-focus", note: "2 px + 2 px offset" },
];
const TONES: { name: string; cls: string }[] = [
  { name: "info", cls: "bg-info-bg border-info-border text-info-fg" },
  { name: "attention", cls: "bg-attention-bg border-attention-border text-attention-fg" },
  { name: "success", cls: "bg-success-bg border-success-border text-success-fg" },
  { name: "danger", cls: "bg-danger-bg border-danger-border text-danger-fg" },
  { name: "muted", cls: "bg-muted-bg border-muted-border text-muted-fg" },
];

type Row = {
  id: string;
  reference: string;
  claimRef: string;
  partner: string;
  property: string;
  suburb: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  status: BookingStatus;
  submittedAt: string | null;
  decisionDueAt: string | null;
};
const ROWS: Row[] = [
  {
    id: "1",
    reference: "LLX-2026-000412",
    claimRef: "CLM-2026-0045",
    partner: "Demo Insurance Co",
    property: "Marvel Tower 1507",
    suburb: "Docklands",
    checkIn: "2026-10-20",
    checkOut: "2026-11-20",
    nights: 31,
    total: 916920,
    status: "SUBMITTED",
    submittedAt: iso(-3),
    decisionDueAt: iso(2),
  },
  {
    id: "2",
    reference: "LLX-2026-000411",
    claimRef: "CLM-2026-0044",
    partner: "Demo Insurance Co",
    property: "4 Halong Drive",
    suburb: "Sunshine North",
    checkIn: "2026-10-16",
    checkOut: "2026-10-23",
    nights: 7,
    total: 232400,
    status: "UNDER_REVIEW",
    submittedAt: iso(-3),
    decisionDueAt: iso(0.5),
  },
  {
    id: "3",
    reference: "LLX-2026-000409",
    claimRef: "CLM-2026-0040",
    partner: "Demo Corporate Relocations",
    property: "673 La Trobe Street 1010",
    suburb: "Docklands",
    checkIn: "2026-10-15",
    checkOut: "2026-10-30",
    nights: 15,
    total: 497000,
    status: "SUBMITTED",
    submittedAt: iso(-30),
    decisionDueAt: iso(-26),
  },
  {
    id: "4",
    reference: "LLX-2026-000405",
    claimRef: "CLM-2026-0038",
    partner: "Demo Insurance Co",
    property: "13 Werder Street",
    suburb: "Box Hill North",
    checkIn: "2026-10-30",
    checkOut: "2026-11-06",
    nights: 7,
    total: 183700,
    status: "APPROVED",
    submittedAt: iso(-50),
    decisionDueAt: iso(-46),
  },
  {
    id: "5",
    reference: "LLX-2026-000398",
    claimRef: "CLM-2026-0031",
    partner: "Demo Insurance Co",
    property: "1403/673 La Trobe Street",
    suburb: "Docklands",
    checkIn: "2026-11-25",
    checkOut: "2026-11-30",
    nights: 5,
    total: 183700,
    status: "CANCELLED",
    submittedAt: iso(-90),
    decisionDueAt: iso(-86),
  },
];

const columns: DataTableColumn<Row>[] = [
  {
    key: "reference",
    header: "Reference",
    primary: true,
    sortable: true,
    cell: (r) => (
      <span className="block">
        <span className="text-body-sm font-mono font-semibold uppercase">{r.reference}</span>
        <span className="text-text-muted text-body-sm block">Claim {r.claimRef}</span>
      </span>
    ),
  },
  { key: "partner", header: "Partner", cell: (r) => r.partner, optional: true },
  {
    key: "property",
    header: "Property",
    cell: (r) => (
      <span className="block">
        <span className="text-text-primary">{r.property}</span>
        <span className="text-text-muted text-body-sm block">{r.suburb}</span>
      </span>
    ),
  },
  {
    key: "stay",
    header: "Stay",
    sortable: true,
    cell: (r) => (
      <span className="block whitespace-nowrap">
        {formatDate(r.checkIn)} → {formatDate(r.checkOut)}
        <span className="text-text-muted text-body-sm block">{r.nights} nights</span>
      </span>
    ),
  },
  { key: "total", header: "Total", numeric: true, sortable: true, cell: (r) => formatMoney(r.total, "AUD") },
  {
    key: "status",
    header: "Status",
    status: true,
    cell: (r) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <StatusPill status={r.status} />
        <SlaBadge status={r.status} submittedAt={r.submittedAt} decisionDueAt={r.decisionDueAt} now={NOW} />
      </span>
    ),
  },
];

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4", className)} aria-labelledby={title.replace(/\W+/g, "-")}>
      <h2 id={title.replace(/\W+/g, "-")}>{title}</h2>
      {children}
    </section>
  );
}

export default function SystemPage() {
  if (!previewsAllowed()) notFound();
  return (
    <main className="mx-auto max-w-[80rem] space-y-12 px-4 py-8 md:px-6">
      <header>
        <p className="eyebrow mb-1">Design system</p>
        <h1>Phase 1 primitives</h1>
        <p className="text-text-muted mt-1">
          Tokens, the four button kinds, status language and the one table, in every state. Dev and preview only.
        </p>
      </header>

      <Section title="Colour roles">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ROLES.map((r) => (
            <li key={r.name} className="space-y-1">
              <div className={cn("rounded-card text-h2 flex h-14 items-center justify-center font-serif", r.cls)}>
                {r.text ?? ""}
              </div>
              <p className="text-body-sm font-semibold">{r.name}</p>
              {r.note && <p className="text-text-muted text-body-sm">{r.note}</p>}
            </li>
          ))}
        </ul>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {TONES.map((t) => (
            <li key={t.name} className={cn("rounded-card border p-3", t.cls)}>
              <p className="font-semibold capitalize">{t.name}</p>
              <p className="text-body-sm">fg on bg, with border</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type ramp">
        <dl className="space-y-3">
          <div>
            <dt className="text-text-muted text-body-sm">display · serif 40/44 (32/36 mobile) · sign-in only</dt>
            <dd className="text-display-sm md:text-display font-serif">
              Long-stay apartments for the people you look after
            </dd>
          </div>
          <div>
            <dt className="text-text-muted text-body-sm">h1 · serif 28/34</dt>
            <dd>
              <span className="text-h1 font-serif">Request queue</span>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted text-body-sm">h2 · serif 20/28</dt>
            <dd>
              <span className="text-h2 font-serif">Changes to the stay</span>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted text-body-sm">h3 · sans 600 15/22</dt>
            <dd>
              <span className="text-h3 font-semibold">Guest and references</span>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted text-body-sm">eyebrow · 11/16 · 0.08em · uppercase · text/gold</dt>
            <dd>
              <span className="eyebrow">Operations</span>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted text-body-sm">body · 15/24</dt>
            <dd>Live Luxe will decide by Tue 14 Oct 2026, 3:00 pm AEDT. The dates are held until then.</dd>
          </div>
          <div>
            <dt className="text-text-muted text-body-sm">body-sm · 13/20</dt>
            <dd className="text-body-sm">Approved Tue 14 Oct 2026, 4:12 pm AEDT by Claudia (Live Luxe)</dd>
          </div>
          <div>
            <dt className="text-text-muted text-body-sm">mono · 13/20 · references only</dt>
            <dd className="text-body-sm font-mono uppercase">LLX-2026-000005 · Claim CLM-2026-0045 · PO 44812</dd>
          </div>
          <div>
            <dt className="text-text-muted text-body-sm">numeric · tabular</dt>
            <dd className="tabular-nums">AUD $1,694.00 · −AUD $225.80 · 12% · 4 waiting · 0 overdue</dd>
          </div>
        </dl>
      </Section>

      <Section title="Buttons: exactly four kinds">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Request this property</Button>
          <Button variant="secondary">Counter-offer</Button>
          <Button variant="tertiary">Cancel</Button>
          <Button variant="destructive">Decline</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading>
            Request this property
          </Button>
          <Button variant="secondary" disabled title="Live availability is temporarily unavailable">
            Approve
          </Button>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <Button variant="secondary" size="icon" aria-label="Search">
            <Search className="h-5 w-5" aria-hidden />
          </Button>
        </div>
        <form className="flex flex-wrap items-center gap-3" action="#">
          <SubmitButton pendingLabel="Sending…">Send invitation</SubmitButton>
          <ConfirmButton variant="destructive" size="default" confirmLabel="Confirm decline">
            Decline request
          </ConfirmButton>
        </form>
      </Section>

      <Section title="Status language">
        <ul className="flex flex-wrap gap-2">
          {BOOKING_STATUSES.map((s) => (
            <li key={s}>
              <StatusPill status={s} />
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap items-center gap-2">
          <li>
            <SlaBadge status="SUBMITTED" submittedAt={iso(-1)} decisionDueAt={iso(2.17)} now={NOW} />
          </li>
          <li>
            <SlaBadge status="UNDER_REVIEW" submittedAt={iso(-3)} decisionDueAt={iso(0.67)} now={NOW} />
          </li>
          <li>
            <SlaBadge status="SUBMITTED" submittedAt={iso(-30)} decisionDueAt={iso(-26)} now={NOW} />
          </li>
          <li>
            <SlaBadge
              status="COUNTER_OFFERED"
              submittedAt={iso(-3)}
              decisionDueAt={iso(2)}
              pausedAt={iso(-0.5)}
              now={NOW}
            />
          </li>
          <li className="text-text-muted text-body-sm">
            Approved / Declined / Cancelled render nothing:{" "}
            <SlaBadge status="APPROVED" submittedAt={iso(-50)} decisionDueAt={iso(-46)} now={NOW} />
            <SlaBadge status="CANCELLED" submittedAt={iso(-50)} decisionDueAt={iso(-46)} now={NOW} />
            <span className="font-mono">∅</span>
          </li>
        </ul>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Pill tone="info">Active</Pill>
          </li>
          <li>
            <Pill tone="attention">Invited · expires in 5 d</Pill>
          </li>
          <li>
            <Pill tone="success">Paid</Pill>
          </li>
          <li>
            <Pill tone="danger">Overdue</Pill>
          </li>
          <li>
            <Pill tone="muted">Disabled</Pill>
          </li>
          <li>
            <Pill tone="neutral">Draft</Pill>
          </li>
        </ul>
      </Section>

      <Section title="Banners">
        <div className="space-y-3">
          <Banner tone="info">Availability confirmed 2 min ago.</Banner>
          <Banner tone="warn">Sync delayed — last confirmed 9:12 am AEDT.</Banner>
          <Banner tone="success">Invitation sent to dana@demo-insurance.example.</Banner>
          <Banner tone="error">
            <p className="font-medium">These dates are no longer available.</p>
            <p>Live Luxe has released your hold. Choose nearby dates or another property. Reference req_8f2a.</p>
          </Banner>
        </div>
      </Section>

      <Section title="Fields">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-body-sm block font-semibold">
            Claim reference{" "}
            <span className="text-gold" aria-hidden>
              *
            </span>
            <input className="mt-1 w-full" placeholder="CLM-2026-0045" aria-required required />
            <span className="text-text-muted mt-1 block font-normal">
              Your organisation requires a claim reference.
            </span>
          </label>
          <label className="text-body-sm block font-semibold">
            Guest email
            <input
              className="mt-1 w-full"
              defaultValue="not-an-email"
              aria-invalid="true"
              aria-describedby="guest-email-err"
            />
            <span id="guest-email-err" className="text-danger-fg mt-1 flex items-center gap-1 font-normal">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Enter a valid email address, or leave it blank.
            </span>
          </label>
          <label className="text-body-sm block font-semibold">
            Payment terms
            <select className="mt-1 w-full" defaultValue="net30">
              <option value="prepay">Card · authorised at submission, charged on approval</option>
              <option value="deposit">Deposit · captured on approval, balance invoiced</option>
              <option value="net30">Invoice · net 30, gated by credit limit</option>
            </select>
          </label>
          <label className="text-body-sm block font-semibold">
            Notes to Live Luxe
            <textarea
              className="mt-1 w-full"
              rows={2}
              placeholder="Access needs, arrival time, anything the team should know"
            />
          </label>
        </div>
      </Section>

      <Section title="Date fields">
        <div className="grid gap-4 sm:grid-cols-2">
          <DateRangeField
            label="Stay dates"
            defaultFrom="2026-11-25"
            defaultTo="2026-11-30"
            min="2026-10-14"
            required
          />
          <DateRangeField
            label="Stay dates (empty)"
            min="2026-10-14"
            hint="Check-in from 3:00 pm, check-out by 10:00 am."
          />
          <DateField label="Takes effect" name="validFrom" defaultValue="2026-10-15" min="2026-10-14" required />
          <DateField
            label="Last day in force (optional)"
            name="validTo"
            clearable
            hint="Leave empty to keep it open."
          />
        </div>
      </Section>

      <Section title="Help, progress and first visit">
        <p className="text-text-secondary flex items-center gap-1">
          Your card is held, not charged
          <HelpTip label="What is a hold?">
            A hold reserves the amount on the card so the dates are yours while Live Luxe reviews. You are only charged
            if Live Luxe approves. If not, the hold drops off by itself.
          </HelpTip>
        </p>
        <div className="space-y-6">
          <StepTracker model={requestProgress({ status: "UNDER_REVIEW" })} />
          <StepTracker model={requestProgress({ status: "CONFIRMED" })} />
          <StepTracker model={requestProgress({ status: "DECLINED", reachedBeforeEnd: "UNDER_REVIEW" })} />
        </div>
        <WelcomeCard supportEmail="contact@liveluxeau.com" />
      </Section>

      <Section title="Sheet, dialog, confirm, toast">
        <div className="flex flex-wrap gap-3">
          <Sheet
            title="New partner"
            description="You can change all of this later."
            trigger={<Button variant="primary">New partner</Button>}
          >
            <SheetForm action="#" submit={<Button variant="primary">Create partner</Button>}>
              <label className="text-text-primary text-body-sm block font-semibold">
                Organisation name{" "}
                <span className="text-gold" aria-hidden>
                  *
                </span>
                <input name="name" className="mt-1 w-full" aria-required required />
              </label>
              <label className="text-text-primary text-body-sm block font-semibold">
                ABN
                <input name="abn" className="mt-1 w-full font-mono" inputMode="numeric" />
              </label>
            </SheetForm>
          </Sheet>
          <ConfirmDialog
            triggerLabel="Approve"
            title="Approve LLX-2026-000412?"
            consequences={[
              "Capture AUD $9,169.20 on Visa ••4417",
              "Create the reservation in Hostaway for Tue 20 Oct → Fri 20 Nov 2026",
              "Issue the tax invoice",
            ]}
            notifies="Dana Partner (Demo Insurance Co) and ops@ are emailed."
            confirmLabel="Approve and charge"
            action="#"
          />
          <ConfirmDialog
            triggerLabel="Decline"
            tone="destructive"
            title="Decline LLX-2026-000412?"
            consequences={["Release the dates and the card hold", "Email the partner the reason below"]}
            confirmLabel="Decline request"
            action="#"
          >
            <label className="text-text-primary text-body-sm block font-semibold">
              Reason{" "}
              <span className="text-gold" aria-hidden>
                *
              </span>
              <select name="reason" className="mt-1 w-full" defaultValue="unavailable">
                <option value="unavailable">The property is no longer available</option>
                <option value="policy">Outside the partner agreement</option>
              </select>
            </label>
          </ConfirmDialog>
          <ManualSearch to="contact@liveluxeau.com" orgName="Demo Insurance Co" />
        </div>
        <Toast title="Request sent" body="Live Luxe will reply by 3:00 pm today. We've emailed you a copy." />
      </Section>

      <Section title="Empty, error and sync states">
        <div className="bg-surface border-subtle rounded-card border">
          <EmptyState
            icon={Inbox}
            title="You're all caught up"
            body="Nothing is waiting on Live Luxe. New requests appear here the moment a partner submits them."
            action={<Button variant="tertiary">See all bookings</Button>}
          />
        </div>
        <ErrorState
          title="We couldn't load your requests."
          meaning="Nothing has been changed; this is only a problem showing the list."
          next="Try again in a moment. If it keeps happening, quote the reference below."
          refCode="req_8f2a19"
          action={<Button variant="secondary">Try again</Button>}
        />
        <div className="flex flex-col gap-2">
          <SyncState
            audience="partner"
            model={syncState({ lastSyncIso: "2026-10-14T02:57:00Z", now: NOW, staleAfterMinutes: 30 })}
          />
          <SyncState
            audience="partner"
            model={syncState({ lastSyncIso: "2026-10-13T22:12:00Z", now: NOW, staleAfterMinutes: 30 })}
          />
          <SyncState
            audience="ops"
            model={syncState({ lastSyncIso: "2026-10-13T22:12:00Z", now: NOW, staleAfterMinutes: 30 })}
          />
          <SyncState
            audience="ops"
            model={syncState({ lastSyncIso: "2026-10-13T22:12:00Z", now: NOW, staleAfterMinutes: 30, degraded: true })}
          />
        </div>
      </Section>

      <Section title="DataTable (table from 768 px, cards below)">
        <div className="rounded-card border-subtle bg-surface border">
          <DataTable
            caption="Requests, ordered by decision deadline"
            columns={columns}
            rows={ROWS}
            rowKey={(r) => r.id}
            rowHref={(r) => `/dev/system#${r.id}`}
            rowLabel={(r) => `Open request ${r.reference}`}
            sort={{ key: "stay", dir: "asc" }}
            sortHref={(key, dir) => `?sort=${key}&dir=${dir}`}
            empty={null}
          />
        </div>
        <div className="rounded-card border-subtle bg-surface border">
          <DataTable
            caption="Requests, dense"
            columns={columns.filter((c) => c.key !== "partner")}
            rows={ROWS.slice(0, 2)}
            rowKey={(r) => r.id}
            dense
            actions={() => (
              <Button variant="tertiary" size="sm">
                Open
              </Button>
            )}
            empty={null}
          />
        </div>
      </Section>
    </main>
  );
}
