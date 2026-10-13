import { KeyRound } from "lucide-react";
import { Panel, PanelHeading } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import type { BookingRequestRow } from "@/lib/db/types";
import { loadCheckinPack, type CheckinPack as Pack } from "@/lib/requests/checkin";
import { formatTimestamp } from "@/lib/utils";

/**
 * §10.6 / §8.4: the access pack, shown only once released (and before purge), read
 * through the checkin_pack() RPC which logs every view. Ops see the release state
 * and can release early; partners see the details.
 */
export async function CheckinPack({
  audience,
  request,
  canRelease,
  viewCount,
}: {
  audience: "partner" | "ops";
  request: BookingRequestRow;
  canRelease?: boolean;
  viewCount?: number;
}) {
  const r = request;
  const live = r.status === "CONFIRMED" || r.status === "CHECKED_IN";
  if (!live && !r.checkin_released_at) return null;
  const released = !!r.checkin_released_at && !r.credentials_purged_at;
  let pack: Pack | null = null;
  if (released && audience === "partner") pack = await loadCheckinPack(r.id);

  return (
    <Panel aria-labelledby="checkin-heading" className="print:hidden">
      <PanelHeading
        id="checkin-heading"
        title="Check-in details"
        description={
          released
            ? `Released ${formatTimestamp(r.checkin_released_at!)}. Every view is logged.`
            : "Released automatically before arrival (48 hours by default); Live Luxe can release early."
        }
        className="mb-2"
      />
      {audience === "ops" && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <KeyRound className="text-muted-foreground h-4 w-4" aria-hidden />
          {released ? (
            <span className="text-foreground">
              Released · viewed {viewCount ?? 0} time{viewCount === 1 ? "" : "s"} by the partner
            </span>
          ) : r.credentials_purged_at ? (
            <span className="text-muted-foreground">
              Credentials purged {formatTimestamp(r.credentials_purged_at)}.
            </span>
          ) : (
            <>
              <span className="text-muted-foreground">Not yet released.</span>
              {canRelease && live && (
                <form method="post" action={`/api/admin/requests/${r.id}`}>
                  <input type="hidden" name="action" value="release_checkin" />
                  <SubmitButton variant="outline" size="sm" pendingLabel="Releasing…">
                    Release now
                  </SubmitButton>
                </form>
              )}
            </>
          )}
        </div>
      )}
      {audience === "partner" && !released && (
        <p className="text-muted-foreground text-sm">
          {r.credentials_purged_at
            ? "These details are no longer available after the stay."
            : "Not released yet. You will be emailed when the address, access code and Wi-Fi are available here."}
        </p>
      )}
      {pack && (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground text-xs">Address</dt>
            <dd className="text-strong">
              {[pack.address_line, pack.suburb, pack.state, pack.postcode].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Check-in from</dt>
            <dd className="text-strong">{pack.checkin_from?.slice(0, 5) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Check-out by</dt>
            <dd className="text-strong">{pack.checkout_by?.slice(0, 5) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Door code</dt>
            <dd className="text-strong font-mono">{pack.door_code ?? "Provided on arrival"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Wi-Fi</dt>
            <dd className="text-strong">
              {pack.wifi_ssid ?? "—"}
              {pack.wifi_password && <span className="block font-mono text-xs">{pack.wifi_password}</span>}
            </dd>
          </div>
          {pack.access_instructions && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs">Access</dt>
              <dd className="text-foreground whitespace-pre-line">{pack.access_instructions}</dd>
            </div>
          )}
          {pack.checkin_instructions && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs">Check-in instructions</dt>
              <dd className="text-foreground whitespace-pre-line">{pack.checkin_instructions}</dd>
            </div>
          )}
          {pack.parking_notes && (
            <div>
              <dt className="text-muted-foreground text-xs">Parking</dt>
              <dd className="text-foreground">{pack.parking_notes}</dd>
            </div>
          )}
          {pack.emergency_contact && (
            <div>
              <dt className="text-muted-foreground text-xs">Emergency contact</dt>
              <dd className="text-foreground">{pack.emergency_contact}</dd>
            </div>
          )}
          {pack.special_instructions && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs">Please note</dt>
              <dd className="text-foreground whitespace-pre-line">{pack.special_instructions}</dd>
            </div>
          )}
        </dl>
      )}
    </Panel>
  );
}
