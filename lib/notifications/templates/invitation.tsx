/**
 * Template: invitation — spec §8.1 / Appendix D.
 * Subject: "You're invited to the Livluxe partner portal — {org}"
 * Must contain: organisation, role, one primary action (the invite link), expiry, a human contact.
 * The link is single-use and expires in 7 days; the token never appears anywhere else.
 */
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";

export interface InvitationProps {
  orgName: string;
  role: string;
  inviteUrl: string;
  invitedBy: string;
  expiresLabel: string;
  supportEmail: string;
}

const ROLE_LABELS: Record<string, string> = {
  partner_admin: "Administrator",
  partner_booker: "Booker",
  partner_viewer: "Viewer",
  partner_finance: "Finance",
  livluxe_ops: "Livluxe operations",
  livluxe_finance: "Livluxe finance",
  livluxe_admin: "Livluxe administrator",
};

export default function Invitation(p: InvitationProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>Set up your Livluxe partner portal account for {p.orgName}</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif", backgroundColor: "#f6f5f2", margin: 0 }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", maxWidth: "560px", margin: "24px auto" }}>
          <Heading as="h1" style={{ fontSize: "20px", color: "#1a1a1a" }}>
            You&apos;re invited to the Livluxe partner portal
          </Heading>
          <Text>
            {p.invitedBy} has invited you to join <strong>{p.orgName}</strong> as{" "}
            <strong>{ROLE_LABELS[p.role] ?? p.role}</strong>. The portal is where your organisation searches
            availability, requests long-stay bookings and tracks their progress.
          </Text>
          <Button
            href={p.inviteUrl}
            style={{
              backgroundColor: "#1a1a1a",
              color: "#fff",
              padding: "12px 20px",
              borderRadius: "6px",
              marginTop: "16px",
            }}
          >
            Accept invitation
          </Button>
          <Text style={{ fontSize: "13px", color: "#444" }}>
            This link is for you only and expires on {p.expiresLabel}. If it has expired, ask your administrator to send
            a new one.
          </Text>
          <Hr style={{ margin: "24px 0" }} />
          <Text style={{ fontSize: "12px", color: "#666" }}>
            Didn&apos;t expect this? You can ignore it; nothing happens unless the link is used. Questions:{" "}
            {p.supportEmail}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
