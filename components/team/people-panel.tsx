import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fieldClass, fieldClasses, fieldErrorClass, labelClass } from "@/components/ui/field";
import { Panel, PanelHeading } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Table, tdClass, thClass, theadClass } from "@/components/ui/table";
import type { UserRole } from "@/lib/domain/permissions";
import type { InvitationRow, PartnerUserRow } from "@/lib/partners/load";
import { cn, formatTimestamp } from "@/lib/utils";

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

const USER_STATUS: Record<string, { label: string; tone: "ok" | "muted" | "neutral" }> = {
  active: { label: "Active", tone: "ok" },
  invited: { label: "Invited", tone: "neutral" },
  disabled: { label: "Access removed", tone: "muted" },
};

/**
 * People in one organisation: active users, open invitations and the invite form.
 * Shared by the partner Team page and the ops Partners screen; `action` is the
 * form route for that side, `roles` the roles the current user may hand out.
 * Removing access and revoking an invitation ask for a second press.
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
        <Panel className="border-accent/60 text-sm" aria-live="polite">
          <p className="text-strong font-medium">Invitation link — shown once, valid for 7 days</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Email is not configured on this environment, so nothing was sent. Copy this link and pass it to the person
            yourself. Anyone with the link can accept the invitation.
          </p>
          <input
            readOnly
            value={inviteLink}
            className={`${fieldClass} mt-3 font-mono text-xs`}
            aria-label="Invitation link"
          />
        </Panel>
      )}

      <Panel flush aria-labelledby="people-heading">
        <PanelHeading
          id="people-heading"
          title="People"
          description={`${users.length} ${users.length === 1 ? "person" : "people"} in this organisation`}
          flush
        />
        {users.length === 0 ? (
          <p className="text-muted-foreground px-5 py-10 text-center text-sm">No one has accepted an invitation yet.</p>
        ) : (
          <Table minWidth="48rem">
            <thead className={theadClass}>
              <tr className="border-border border-b">
                <th className={thClass}>Name</th>
                <th className={thClass}>Role</th>
                <th className={thClass}>Last seen</th>
                <th className={thClass}>Status</th>
                {/* `relative` keeps the hidden label inside the scroll container on phones. */}
                <th className={`${thClass} relative`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.auth_user_id === currentUserAuthId;
                const status = USER_STATUS[u.status] ?? { label: u.status, tone: "neutral" as const };
                return (
                  <tr key={u.id} className="border-border border-b last:border-0">
                    <td className={tdClass}>
                      <span className="text-strong">
                        {u.full_name ?? "—"}
                        {self && <span className="text-muted-foreground font-normal"> (you)</span>}
                      </span>
                      <span className="text-muted-foreground block text-xs">{u.email}</span>
                    </td>
                    <td className={tdClass}>{ROLE_LABELS[u.role as UserRole] ?? u.role}</td>
                    <td className={cn(tdClass, "text-muted-foreground text-xs whitespace-nowrap")}>
                      {u.last_seen_at ? formatTimestamp(u.last_seen_at) : "Never"}
                    </td>
                    <td className={tdClass}>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </td>
                    <td className={cn(tdClass, "py-2 text-right")}>
                      {!self && u.status !== "invited" && (
                        <form method="post" action={action} className="inline-flex justify-end">
                          <input type="hidden" name="action" value={u.status === "disabled" ? "enable" : "disable"} />
                          <input type="hidden" name="userId" value={u.id} />
                          {u.status === "disabled" ? (
                            <SubmitButton variant="ghost" size="sm" pendingLabel="Restoring…">
                              Restore access
                            </SubmitButton>
                          ) : (
                            <ConfirmButton confirmLabel="Confirm removal" pendingLabel="Removing…">
                              Remove access
                            </ConfirmButton>
                          )}
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      {invitations.length > 0 && (
        <Panel flush aria-labelledby="invitations-heading">
          <PanelHeading id="invitations-heading" title="Open invitations" flush />
          <ul className="divide-border divide-y text-sm">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <span className="text-strong">{i.email}</span>
                  <span className="text-muted-foreground block text-xs">
                    {ROLE_LABELS[i.role as UserRole] ?? i.role} · expires {formatTimestamp(i.expires_at)}
                  </span>
                </div>
                <form method="post" action={action}>
                  <input type="hidden" name="action" value="revoke" />
                  <input type="hidden" name="invitationId" value={i.id} />
                  <ConfirmButton confirmLabel="Confirm revoke" pendingLabel="Revoking…">
                    Revoke
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel aria-labelledby="invite-heading">
        <PanelHeading id="invite-heading" title="Invite someone" />
        <form method="post" action={action} className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <input type="hidden" name="action" value="invite" />
          <label className={labelClass}>
            Email <span className="text-accent-ink">*</span>
            <input
              name="email"
              type="email"
              required
              defaultValue={values.email}
              aria-invalid={errorFields.has("email") || undefined}
              className={fieldClasses(errorFields.has("email"))}
            />
            {errorFields.has("email") && <span className={fieldErrorClass}>Enter a valid email address.</span>}
          </label>
          <label className={labelClass}>
            Role <span className="text-accent-ink">*</span>
            <select name="role" required defaultValue={values.role || roles[0]} className={`${fieldClass} mt-1`}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton variant="gold" pendingLabel="Sending invitation…">
            Send invitation
          </SubmitButton>
        </form>
        <dl className="text-muted-foreground mt-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {roles.map((r) => (
            <div key={r} className="flex gap-1.5">
              <dt className="text-foreground shrink-0 font-medium">{ROLE_LABELS[r]}</dt>
              <dd>{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
