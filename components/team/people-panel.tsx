import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ConfirmDialog, Sheet, SheetForm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import { STATUS_TONE_CLASSES, pillClass } from "@/components/ui/status-pill";
import { SubmitButton } from "@/components/ui/submit-button";
import { InviteFields } from "@/components/team/invite-fields";
import type { UserRole } from "@/lib/domain/permissions";
import { formatDuration } from "@/lib/domain/status";
import type { InvitationRow, PartnerUserRow } from "@/lib/partners/load";
import { cn, formatWhen } from "@/lib/utils";

export const ROLE_LABELS: Record<UserRole, string> = {
  partner_admin: "Administrator",
  partner_booker: "Booker",
  partner_viewer: "Viewer",
  partner_finance: "Finance",
  livluxe_ops: "Live Luxe operations",
  livluxe_finance: "Live Luxe finance",
  livluxe_admin: "Live Luxe administrator",
};

const ROLE_HELP: Record<UserRole, string> = {
  partner_admin: "Books, pays and manages who has access.",
  partner_booker: "Searches, sends requests and pays for them.",
  partner_finance: "Sees invoices and payments; cannot book.",
  partner_viewer: "Sees requests and bookings; cannot change anything.",
  livluxe_ops: "Queue, decisions and bookings.",
  livluxe_finance: "Operations plus rate cards, refunds and audit.",
  livluxe_admin: "Everything, including partners and users.",
};

/** Brief §7.8 order: Administrator → Booker → Finance → Viewer. */
const ROLE_ORDER: UserRole[] = [
  "partner_admin",
  "partner_booker",
  "partner_finance",
  "partner_viewer",
  "livluxe_admin",
  "livluxe_finance",
  "livluxe_ops",
];

type PersonRow =
  { kind: "user"; id: string; user: PartnerUserRow } | { kind: "invite"; id: string; invite: InvitationRow };

/**
 * People in one organisation (brief §7.8): who can book for us, and who is waiting to
 * join. One table of people and open invitations, an "Invite someone" Sheet, and
 * removal behind a confirmation. Shared by the partner Team page and ops Partners;
 * `action` is that side's form route and `roles` the roles the viewer may hand out.
 * The last administrator cannot lose access: the control is disabled and says why.
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
  manages = true,
  emailDomains = [],
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
  /** False for partner roles that may only look. */
  manages?: boolean;
  /** The organisation's email domains, for the mismatch warning on invites. */
  emailDomains?: string[];
}) {
  const now = new Date();
  const activeAdmins = users.filter((u) => u.role === "partner_admin" && u.status === "active").length;
  const ordered = [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  const rows: PersonRow[] = [
    ...users.map((u) => ({ kind: "user" as const, id: u.id, user: u })),
    ...invitations.map((i) => ({ kind: "invite" as const, id: i.id, invite: i })),
  ];

  const status = (r: PersonRow) => {
    if (r.kind === "invite") {
      const left = new Date(r.invite.expires_at).getTime() - now.getTime();
      return {
        tone: "info" as const,
        label: left > 0 ? `Invited · expires in ${formatDuration(left)}` : "Invitation expired",
      };
    }
    if (r.user.status === "disabled") return { tone: "muted" as const, label: "Access removed" };
    if (r.user.status === "invited") return { tone: "info" as const, label: "Invited" };
    return { tone: "success" as const, label: "Active" };
  };

  const columns: DataTableColumn<PersonRow>[] = [
    {
      key: "name",
      header: "Name",
      primary: true,
      cell: (r) =>
        r.kind === "invite" ? (
          <span className="block">
            <span className="text-text-primary block font-semibold">{r.invite.email}</span>
            <span className="text-text-muted block">Not joined yet</span>
          </span>
        ) : (
          <span className="block">
            <span className="text-text-primary block font-semibold">
              {r.user.full_name ?? r.user.email}
              {r.user.auth_user_id === currentUserAuthId && <span className="text-text-muted font-normal"> (you)</span>}
            </span>
            <span className="text-text-muted block">{r.user.email}</span>
          </span>
        ),
    },
    {
      key: "role",
      header: "Role",
      cell: (r) => {
        const role = (r.kind === "user" ? r.user.role : r.invite.role) as UserRole;
        return <span className="text-text-primary">{ROLE_LABELS[role] ?? role}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      status: true,
      cell: (r) => {
        const s = status(r);
        return <span className={cn(pillClass, STATUS_TONE_CLASSES[s.tone])}>{s.label}</span>;
      },
    },
    {
      key: "seen",
      header: "Last seen",
      cell: (r) => {
        if (r.kind === "invite") return <span className="text-text-muted">—</span>;
        if (r.user.auth_user_id === currentUserAuthId) return <span className="text-text-secondary">Now</span>;
        return (
          <span className="text-text-secondary whitespace-nowrap">
            {r.user.last_seen_at ? formatWhen(r.user.last_seen_at, now) : "Never"}
          </span>
        );
      },
    },
  ];

  if (manages)
    columns.push({
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cardLabel: " ",
      cell: (r) => {
        if (r.kind === "invite")
          return (
            <span className="relative z-10 flex justify-end">
              <ConfirmDialog
                triggerLabel="Revoke invitation"
                triggerVariant="tertiary"
                triggerSize="sm"
                tone="destructive"
                title={`Revoke the invitation to ${r.invite.email}?`}
                consequences={["The link in their email stops working", "You can invite them again at any time"]}
                confirmLabel="Revoke invitation"
                action={action}
                hidden={{ action: "revoke", invitationId: r.invite.id }}
              />
            </span>
          );
        const u = r.user;
        if (u.auth_user_id === currentUserAuthId || u.status === "invited") return null;
        if (u.status === "disabled")
          return (
            <form method="post" action={action} className="relative z-10 flex justify-end">
              <input type="hidden" name="action" value="enable" />
              <input type="hidden" name="userId" value={u.id} />
              <SubmitButton variant="secondary" size="sm" pendingLabel="Restoring…">
                Restore access
              </SubmitButton>
            </form>
          );
        const lastAdmin = u.role === "partner_admin" && activeAdmins <= 1;
        if (lastAdmin)
          return (
            <span className="relative z-10 flex flex-col items-end gap-0.5">
              <Button variant="tertiary" size="sm" disabled aria-describedby={`last-admin-${u.id}`}>
                Remove access
              </Button>
              <span id={`last-admin-${u.id}`} className="text-text-muted text-body-sm">
                The only administrator
              </span>
            </span>
          );
        return (
          <span className="relative z-10 flex justify-end">
            <ConfirmDialog
              triggerLabel="Remove access"
              triggerVariant="tertiary"
              triggerSize="sm"
              tone="destructive"
              title={`Remove ${u.full_name ?? u.email}'s access?`}
              consequences={[
                "They are signed out and cannot sign in to the portal",
                "Requests they sent stay with your organisation",
                "You can restore access later",
              ]}
              confirmLabel="Remove access"
              action={action}
              hidden={{ action: "disable", userId: u.id }}
            />
          </span>
        );
      },
    });

  const invite = manages && (
    <Sheet
      title="Invite someone"
      description="They get an email with a link to set a password. The link works for 7 days."
      defaultOpen={errorFields.has("email")}
      trigger={
        <Button variant="primary" className="w-full sm:w-auto">
          <UserPlus className="h-4 w-4" aria-hidden /> Invite someone
        </Button>
      }
    >
      <SheetForm
        action={action}
        hidden={{ action: "invite" }}
        submit={<SubmitButton pendingLabel="Sending…">Send invitation</SubmitButton>}
      >
        <InviteFields
          roles={ordered.map((r) => ({ value: r, label: ROLE_LABELS[r], help: ROLE_HELP[r] }))}
          domains={emailDomains.map((d) => d.toLowerCase())}
          defaultEmail={values.email ?? ""}
          defaultRole={values.role || (ordered.includes("partner_booker") ? "partner_booker" : ordered[0]!)}
          emailInvalid={errorFields.has("email")}
        />
      </SheetForm>
    </Sheet>
  );

  return (
    <div className="space-y-4">
      {inviteLink && (
        <div
          className="border-attention-border bg-attention-bg rounded-card space-y-2 border px-5 py-4"
          aria-live="polite"
        >
          <p className="text-text-primary font-semibold">Invitation link, shown once, valid for 7 days</p>
          <p className="text-text-secondary text-body-sm">
            Email is not set up here, so nothing was sent. Copy the link and pass it to the person yourself. Anyone with
            the link can accept the invitation.
          </p>
          <p className="flex items-center gap-2">
            <code className="bg-surface border-subtle rounded-control text-body-sm min-w-0 flex-1 truncate border px-3 py-2">
              {inviteLink}
            </code>
            <CopyButton value={inviteLink} label="invitation link" />
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-secondary">
          {users.length} {users.length === 1 ? "person" : "people"}
          {invitations.length > 0 && ` · ${invitations.length} waiting to join`}
        </p>
        {invite}
      </div>

      <div className="border-subtle bg-surface rounded-card overflow-clip border">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.kind}:${r.id}`}
          caption="People and open invitations"
          empty={
            <EmptyState
              icon={Users}
              title="No one here yet"
              body="Invite the people who place stays for your organisation. Each gets their own sign-in."
              action={invite || undefined}
            />
          }
        />
      </div>
    </div>
  );
}
