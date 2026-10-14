import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { RateCardForm } from "@/components/admin/rate-card-form";
import { Flash } from "@/components/requests/flash";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { STATUS_TONE_CLASSES, pillClass } from "@/components/ui/status-pill";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { addDays, todayIn } from "@/lib/domain/dates";
import { can } from "@/lib/domain/permissions";
import { rateCardDiscount, rateCardTiers, rateCardWaivers } from "@/lib/domain/rate-card-display";
import { getOrg } from "@/lib/partners/load";
import { listRateCards, type RateCardVersion } from "@/lib/rate-cards/load";
import { cn, formatDate, formatWhen } from "@/lib/utils";

export const metadata = { title: "Rate card" };
export const dynamic = "force-dynamic";
const TZ = "Australia/Melbourne";
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

const state = (v: RateCardVersion, today: string) =>
  v.current ? "current" : v.validFrom > today ? "scheduled" : "ended";
const STATE = {
  current: { label: "Current", tone: "success" as const },
  scheduled: { label: "Scheduled", tone: "info" as const },
  ended: { label: "Ended", tone: "muted" as const },
};

/**
 * One partner's rate card (brief §6.6): the versions as a timeline, newest on top, and
 * "Publish a new version" in a Sheet. Ended versions fold away. Finance and admin.
 */
export default async function OrgRateCardPage({ params, searchParams }: PageProps<"/admin/rate-cards/[orgId]">) {
  const claims = await getSessionClaims();
  if (!claims || !can(claims.role, "rate_cards.manage")) redirect("/admin/queue");
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const today = todayIn(TZ);
  const [org, versions] = await Promise.all([getOrg(orgId), listRateCards(orgId, today)]);
  if (!org) notFound();
  const authorIds = [...new Set(versions.map((v) => v.row.created_by).filter((x): x is string => !!x))];
  const supabase = await createServerSupabase();
  const { data: authors } = authorIds.length
    ? await supabase
        .from("partner_users")
        .select("auth_user_id, id, full_name")
        .or(`id.in.(${authorIds.join(",")}),auth_user_id.in.(${authorIds.join(",")})`)
    : { data: [] as { auth_user_id: string; id: string; full_name: string | null }[] };
  const who = (id: string | null) =>
    id ? ((authors ?? []).find((a) => a.id === id || a.auth_user_id === id)?.full_name ?? "Live Luxe") : "Live Luxe";
  const now = new Date();

  const values = Object.fromEntries(
    ["name", "discountPct", "validFrom", "lastDay", "losTiers", "cleaningFeeFromNights", "waiveSecurityDeposit"].map(
      (k) => [k, str(sp[k])],
    ),
  );
  const errorFields = new Set(str(sp.fields).split(",").filter(Boolean));
  const current = versions.find((v) => v.current) ?? null;
  const live = versions.filter((v) => state(v, today) !== "ended");
  const ended = versions.filter((v) => state(v, today) === "ended");

  const item = (v: RateCardVersion) => {
    const st = STATE[state(v, today)];
    return (
      <li key={v.row.id} className="relative pb-6 pl-8 last:pb-0">
        <span
          className={cn(
            "absolute top-1.5 left-0 h-3 w-3 rounded-full border-2",
            st.label === "Current" ? "border-success-fg bg-success-fg" : "border-strong-border bg-surface",
          )}
          aria-hidden
        />
        <div className="border-subtle bg-surface rounded-card border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-text-primary font-semibold">
              {v.row.name} <span className="text-text-muted font-normal">· version {v.row.version}</span>
            </p>
            <span className={cn(pillClass, STATUS_TONE_CLASSES[st.tone])}>{st.label}</span>
          </div>
          <p className="text-text-primary mt-1">{rateCardDiscount(v.card)}</p>
          {(rateCardTiers(v.card) || rateCardWaivers(v.card)) && (
            <p className="text-text-secondary text-body-sm">
              {[rateCardTiers(v.card), rateCardWaivers(v.card)].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-text-muted text-body-sm mt-2">
            {formatDate(v.validFrom)} to {v.validTo ? formatDate(addDays(v.validTo, -1)) : "open-ended"} · published by{" "}
            {who(v.row.created_by)} {formatWhen(v.row.created_at, now)}
          </p>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <Link
        href="/admin/rate-cards"
        className="text-text-secondary hover:text-text-primary text-body-sm inline-flex items-center gap-1 font-semibold"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All rate cards
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow mb-1">Rate card</p>
          <h1 className="text-h1 text-text-primary font-serif tracking-tight">{org.name}</h1>
          <p className="text-text-secondary mt-1">
            {current
              ? `${current.row.name} is in force.`
              : "No card in force: this partner is quoted the Hostaway rate."}{" "}
            Only one version applies on any date.
          </p>
        </div>
        <Sheet
          title="Publish a new version"
          description={`For ${org.name}. Takes effect on the date you choose.`}
          size="lg"
          defaultOpen={errorFields.size > 0}
          trigger={
            <Button variant="primary" className="w-full sm:w-auto">
              <Plus className="h-4 w-4" aria-hidden /> Publish a new version
            </Button>
          }
        >
          <RateCardForm
            orgId={orgId}
            today={today}
            tomorrow={addDays(today, 1)}
            values={values}
            errorFields={errorFields}
            current={current ? { name: current.row.name } : null}
          />
        </Sheet>
      </header>
      <Flash
        toast
        done={str(sp.done) || undefined}
        error={str(sp.error) || undefined}
        detail={str(sp.detail) || undefined}
      />

      {versions.length === 0 ? (
        <p className="border-subtle bg-surface rounded-card text-text-secondary border px-5 py-10 text-center">
          No versions yet. Publish the first to give this partner a contracted discount.
        </p>
      ) : (
        <section aria-labelledby="versions-heading" className="max-w-3xl space-y-3">
          <h2 id="versions-heading">Versions</h2>
          <ol className="border-subtle ml-1.5 border-l pl-0">{live.map(item)}</ol>
          {ended.length > 0 && (
            <details className="group">
              <summary className="text-text-primary cursor-pointer font-semibold underline underline-offset-4">
                {ended.length} ended {ended.length === 1 ? "version" : "versions"}
              </summary>
              <ol className="border-subtle mt-3 ml-1.5 border-l">{ended.map(item)}</ol>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
