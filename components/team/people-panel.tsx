import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/domain/permissions";
import type { InvitationRow, PartnerUserRow } from "@/lib/partners/load";
import { formatTimestamp } from "@/lib/utils";

const input = "border-cream-300 h-10 w-full rounded-md border bg-white px-3 text-sm";

export const ROLE_LABELS: Record<UserRole, string> = {
  partner_admin: "Administrator",
  partner_booker: "Booker",
  partner_viewer: "Viewer",
  partner_finance: "Finance",
  livluxe_ops: "Live Luxe operations",
  livluxe_finance: "Live Luxe finance",
  livluxe_admin: "Live Luxe administrator",
};

const ROLE_HELP: Partial<Record<UserRole, string>> = {
  partner_admin: "Books, pays and manages the team",
  partner_booker: "Searches, requests and pays",
  partner_viewer: "Read-only",
  partner_finance: "Invoices and payments only",
  livluxe_ops: "Queue, decisions, bookings",
  livluxe_finance: "Ops plus rate cards, refunds, audit",
  livluxe_admin: "Everything, including partners and users",
};

/**
 * People in one organisation: active users, open invitations and the invite form.
 * Shared by the partner Team page and the ops Partners screen; `action` is the
 * form route for that side, `roles` the roles the current user may hand out.
 */
export function PeoplePanel({
  action,
  users,
  invitations,
  roles,
  currentUserAuthId,
  inviteLink,
  errorFields,
  values,
}: {
  action: string;
  users: PartnerUserRow[];
  invitations: InvitationRow[];
  roles: UserRole[];
  currentUserAuthId: string;
  /** Shown once when email delivery is not configured. */
  inviteLink?: string | null;
  errorFields: Set<string>;
  values: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      {inviteLink && (
        <div className="border-gold-500 rounded-xl border bg-white p-5 text-sm">
          <p className="text-navy-900 font-medium">Invitation link (shown once, valid 7 days)</p>
          <p className="text-ink-500 mt-1 text-xs">
            Email is not configured on this environment, so nothing was sent. Copy this link and pass it to the person
            yourself. Anyone with the link can accept the invitation.
          </p>
          <input readOnly value={inviteLink} className={`${input} mt-2 font-mono text-xs`} />
        </div>
      )}

      <section className="border-cream-200 rounded-xl border bg-white">
        <h2 className="border-cream-200 border-b px-5 py-3 font-serif text-lg">People</h2>
        {users.length === 0 ? (
          <p className="text-ink-500 px-5 py-8 text-center text-sm">No one has accepted an invitation yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-ink-500 text-xs tracking-wide uppercase">
              <tr className="border-cream-200 border-b">
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Last seen</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.auth_user_id === currentUserAuthId;
                return (
                  <tr key={u.id} className="border-cream-200 border-b last:border-0">
                    <td className="px-5 py-3 align-top">
                      <span className="text-navy-900">{u.full_name ?? "—"}</span>
                      <span className="text-ink-500 block text-xs">{u.email}</span>
                    </td>
                    <td className="px-3 py-3 align-top">{ROLE_LABELS[u.role as UserRole] ?? u.role}</td>
                    <td className="text-ink-500 px-3 py-3 align-top text-xs whitespace-nowrap">
                      {u.last_seen_at ? formatTimestamp(u.last_seen_at) : "never"}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={
                          u.status === "active"
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                            : "bg-cream-200 text-ink-700 rounded-full px-2 py-0.5 text-xs"
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right align-top">
                      {!self && u.status !== "invited" && (
                        <form method="post" action={action}>
                          <input type="hidden" name="action" value={u.status === "disabled" ? "enable" : "disable"} />
                          <input type="hidden" name="userId" value={u.id} />
                          <Button type="submit" variant="ghost" size="sm" className="text-xs">
                            {u.status === "disabled" ? "Restore access" : "Remove access"}
                          </Button>
                        </form>
                      )}
                      {self && <span className="text-ink-500 text-xs">you</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {invitations.length > 0 && (
        <section className="border-cream-200 rounded-xl border bg-white">
          <h2 className="border-cream-200 border-b px-5 py-3 font-serif text-lg">Open invitations</h2>
          <ul className="divide-cream-200 divide-y text-sm">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <span className="text-navy-900">{i.email}</span>
                  <span className="text-ink-500 block text-xs">
                    {ROLE_LABELS[i.role as UserRole] ?? i.role} · expires {formatTimestamp(i.expires_at)}
                  </span>
                </div>
                <form method="post" action={action}>
                  <input type="hidden" name="action" value="revoke" />
                  <input type="hidden" name="invitationId" value={i.id} />
                  <Button type="submit" variant="ghost" size="sm" className="text-xs">
                    Revoke
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-cream-200 rounded-xl border bg-white p-5">
        <h2 className="mb-3 font-serif text-lg">Invite someone</h2>
        <form method="post" action={action} className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <input type="hidden" name="action" value="invite" />
          <label className="block text-xs font-medium">
            Email <span className="text-gold-600">*</span>
            <input
              name="email"
              type="email"
              required
              defaultValue={values.email}
              className={`${input} mt-1 ${errorFields.has("email") ? "border-red-400 ring-1 ring-red-300" : ""}`}
            />
          </label>
          <label className="block text-xs font-medium">
            Role <span className="text-gold-600">*</span>
            <select name="role" required defaultValue={values.role || roles[0]} className={`${input} mt-1`}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="gold">
            Send invitation
          </Button>
        </form>
        <ul className="text-ink-500 mt-3 grid gap-1 text-xs sm:grid-cols-2">
          {roles.map((r) => (
            <li key={r}>
              <span className="text-ink-700 font-medium">{ROLE_LABELS[r]}:</span> {ROLE_HELP[r]}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
