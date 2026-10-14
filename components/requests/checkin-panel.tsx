import { KeyRound, Lock, MapPin } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import type { CheckinView } from "@/lib/requests/checkin";
import { cn, formatClock, formatTimestamp, formatWhen } from "@/lib/utils";

export interface CheckinPanelProps {
  audience: "partner" | "ops";
  view: CheckinView;
  /** Ops only: who has looked at the pack. */
  accessLog?: { id: number; who: string; ip: string | null; at: string }[];
  supportEmail: string;
}

function Fact({
  label,
  value,
  copy,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  copy?: boolean;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-x-3 py-1.5">
      <dt className="text-text-muted text-body-sm pt-0.5">{label}</dt>
      <dd className="flex min-w-0 items-start gap-1">
        <span
          className={cn("text-text-primary min-w-0 whitespace-pre-line", mono && "text-h3 font-mono tracking-wider")}
        >
          {value}
        </span>
        {copy && <CopyButton value={value} label={label.toLowerCase()} className="-my-1" />}
      </dd>
    </div>
  );
}

/**
 * Check-in details (brief §2.4, §8.6). Always says which tier is in force and when the
 * next one unlocks: approximate location → exact address once approved → the full
 * access pack 48 hours before check-in → hidden after checkout. Each item can be
 * copied; the pack carries the confidentiality line and the note that views are logged.
 * Ops release the pack from the action panel, not from here.
 */
export function CheckinPanel(p: CheckinPanelProps) {
  const v = p.view;
  if (v.tier === "none") return null;
  const tz = v.timezone;
  const releaseWhen = formatWhen(v.timing.releaseDueAt.toISOString());

  if (v.tier === "approx")
    return (
      <section aria-labelledby="checkin-heading" className="bg-surface border-subtle rounded-card border p-5">
        <h2 id="checkin-heading" className="flex items-center gap-2">
          <Lock className="text-text-muted h-4 w-4" aria-hidden /> Check-in details
        </h2>
        <p className="text-text-secondary mt-2">
          {p.audience === "partner"
            ? "The exact address is shared once your request is approved. The door code and Wi-Fi follow 48 hours before check-in."
            : "The partner sees the suburb only until the request is approved."}
        </p>
      </section>
    );

  const a = v.address!;
  const window = a.checkinFrom
    ? `From ${formatClock(a.checkinFrom)}${a.checkinTo ? ` to ${formatClock(a.checkinTo)}` : ""}`
    : null;
  // Hostaway's address line is often already complete ("…, Melbourne VIC 3000, Australia"); only add what is missing.
  const tail = [a.suburb, a.state, a.postcode].filter(Boolean).join(" ");
  const fullAddress =
    a.addressLine && (!a.postcode || a.addressLine.includes(a.postcode))
      ? a.addressLine.replace(/,\s*Australia$/i, "")
      : [a.addressLine, tail].filter(Boolean).join(", ");

  return (
    <section aria-labelledby="checkin-heading" className="bg-surface border-subtle rounded-card print-keep border p-5">
      <h2 id="checkin-heading" className="flex items-center gap-2">
        {v.tier === "full" ? (
          <KeyRound className="text-text-gold h-4 w-4" aria-hidden />
        ) : (
          <MapPin className="text-text-muted h-4 w-4" aria-hidden />
        )}
        Check-in details
      </h2>
      <p className="text-text-secondary mt-1">
        {v.tier === "full"
          ? `Released ${formatTimestamp(v.releasedAt!, tz)}. Hidden again 24 hours after check-out.`
          : p.audience === "partner"
            ? `The door code and Wi-Fi arrive ${releaseWhen}, by email and here.`
            : `The access pack releases ${releaseWhen} (${v.timing.offsetHours} hours before check-in).`}
      </p>

      <dl className="divide-subtle mt-3 divide-y">
        <Fact label="Address" value={fullAddress || "Not on file — contact Live Luxe"} copy={!!fullAddress} />
        <Fact label="Check-in" value={window} />
        <Fact label="Check-out" value={a.checkoutBy ? `By ${formatClock(a.checkoutBy)}` : null} />
        <Fact label="Parking" value={a.parkingNotes} />
      </dl>

      {v.tier === "full" && v.pack && (
        <div className="border-subtle mt-4 border-t pt-4">
          <p className="text-attention-fg text-body-sm font-semibold">
            Confidential — share with the guest only, do not forward.
          </p>
          <dl className="divide-subtle mt-2 divide-y">
            <Fact label="Door code" value={v.pack.doorCode} copy mono />
            <Fact label="Wi-Fi network" value={v.pack.wifiSsid} copy />
            <Fact label="Wi-Fi password" value={v.pack.wifiPassword} copy mono />
            <Fact label="Getting in" value={v.pack.accessInstructions} />
            <Fact label="Check-in notes" value={v.pack.checkinInstructions} />
            <Fact label="Please note" value={v.pack.specialInstructions} />
            <Fact label="Emergency" value={v.pack.emergencyContact} copy />
          </dl>
          {!v.pack.secretsStored && (
            <p className="bg-attention-bg text-attention-fg border-attention-border rounded-control text-body-sm mt-3 border px-3 py-2">
              The door code isn&apos;t stored here yet. Email {p.supportEmail} with the booking reference and we&apos;ll
              send it.
            </p>
          )}
          <p className="text-text-muted text-body-sm mt-3">
            Each time someone opens these details we record who, when and from where.
          </p>
        </div>
      )}

      {p.audience === "ops" && p.accessLog && (
        <div className="border-subtle mt-4 border-t pt-4 print:hidden">
          <h3>Who has opened the pack</h3>
          {p.accessLog.length === 0 ? (
            <p className="text-text-muted text-body-sm mt-1">Nobody yet.</p>
          ) : (
            <ul className="text-text-secondary text-body-sm mt-1 space-y-0.5">
              {p.accessLog.map((x) => (
                <li key={x.id}>
                  {x.who} · {formatTimestamp(x.at)}
                  {x.ip && <span className="text-text-muted font-mono"> · {x.ip}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
