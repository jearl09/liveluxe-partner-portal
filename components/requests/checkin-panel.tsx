import { KeyRound, MapPin } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Panel, PanelHeading } from "@/components/ui/panel";
import type { BookingRequestRow } from "@/lib/db/types";
import type { CheckinView } from "@/lib/requests/checkin";
import { formatTimestamp } from "@/lib/utils";

export interface CheckinPanelProps {
  audience: "partner" | "ops";
  request: BookingRequestRow;
  view: CheckinView;
  /** Ops only: livluxe_ops/finance/admin may release early. */
  canRelease?: boolean;
  /** Ops only: who has looked at the pack. */
  accessLog?: { id: number; who: string; ip: string | null; at: string }[];
  supportEmail: string;
}

const time = (t: string | null) => (t ? t.slice(0, 5) : null);

function Row({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "text-strong font-mono text-base tracking-wider" : "text-strong whitespace-pre-line"}>
        {value}
      </dd>
    </>
  );
}

/**
 * Check-in details at the tier §8.4 allows: address once approved, the full access
 * pack once released, nothing after cancellation. The tier is computed server-side
 * (lib/requests/checkin.ts); this component only lays out what it was given.
 */
export function CheckinPanel(p: CheckinPanelProps) {
  const { view: v, request: r } = p;
  if (v.tier === "none" || v.tier === "approx") return null;
  const a = v.address!;
  const tz = v.timezone;
  const window = a.checkinFrom
    ? `from ${time(a.checkinFrom)}${a.checkinTo ? ` to ${time(a.checkinTo)}` : ""}`
    : "see instructions";
  const fullAddress = [a.addressLine, [a.suburb, a.state, a.postcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <Panel aria-labelledby="checkin-heading" className="print-keep">
      <PanelHeading
        id="checkin-heading"
        title="Check-in details"
        description={
          v.tier === "full"
            ? `Access pack released ${formatTimestamp(v.releasedAt!, tz)}. Hidden again 24 hours after checkout.`
            : `Door code, Wi-Fi and entry instructions unlock ${formatTimestamp(v.timing.releaseDueAt.toISOString(), tz)} (${v.timing.offsetHours} hours before check-in).`
        }
        className="mb-3"
      />

      <dl className="text-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden /> Address
        </dt>
        <dd className="text-strong">{fullAddress || "Address not on file; contact Live Luxe."}</dd>
        <Row label="Check-in" value={`${window} (${tz.replace("_", " ")})`} />
        <Row label="Checkout" value={a.checkoutBy ? `by ${time(a.checkoutBy)}` : null} />
        <Row label="Parking" value={a.parkingNotes} />
      </dl>

      {v.tier === "full" && v.pack && (
        <div className="border-border mt-4 border-t pt-4">
          <p className="text-strong mb-2 flex items-center gap-1 text-sm font-medium">
            <KeyRound className="h-4 w-4" aria-hidden /> Access pack
          </p>
          <dl className="text-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <Row label="Door code" value={v.pack.doorCode} mono />
            <Row label="Wi-Fi network" value={v.pack.wifiSsid} />
            <Row label="Wi-Fi password" value={v.pack.wifiPassword} mono />
            <Row label="Getting in" value={v.pack.accessInstructions} />
            <Row label="Check-in instructions" value={v.pack.checkinInstructions} />
            <Row label="Please note" value={v.pack.specialInstructions} />
            <Row label="Emergency contact" value={v.pack.emergencyContact} />
          </dl>
          {!v.pack.secretsStored && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The door code is not stored on this environment. Call or email {p.supportEmail} and quote {r.reference}.
            </p>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            Every view of this pack is logged with your name, time and IP address. Share it with the guest only.
          </p>
        </div>
      )}

      {p.audience === "ops" && (
        <div className="border-border mt-4 space-y-3 border-t pt-4 print:hidden">
          {p.canRelease && v.canReleaseNow && (
            <form method="post" action={`/api/admin/requests/${r.id}`} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="action" value="release_checkin" />
              <ConfirmButton
                variant="outline"
                size="default"
                confirmLabel="Confirm early release"
                pendingLabel="Releasing…"
              >
                Release access pack now
              </ConfirmButton>
              <span className="text-muted-foreground text-xs">Emails the partner and shows the codes immediately.</span>
            </form>
          )}
          {p.accessLog && (
            <div>
              <p className="text-muted-foreground text-xs font-medium">Pack views</p>
              {p.accessLog.length === 0 ? (
                <p className="text-muted-foreground text-xs">Nobody has opened the pack yet.</p>
              ) : (
                <ul className="text-foreground mt-1 space-y-0.5 text-xs">
                  {p.accessLog.map((x) => (
                    <li key={x.id}>
                      {x.who} · {formatTimestamp(x.at)}
                      {x.ip && <span className="text-muted-foreground font-mono"> · {x.ip}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
