/**
 * Partner emails for payment events and post-confirmation operations — Appendix D,
 * §17.2 (card declined, 3DS abandoned, authorisation lapsed), §17.5 (SLA auto-extend),
 * §10.6 (check-in pack, extensions, early departure).
 */
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

interface Common {
  reference: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  supportEmail: string;
}

const shell = { fontFamily: "Helvetica, Arial, sans-serif", backgroundColor: "#f4efe6", margin: 0 } as const;
const card = { backgroundColor: "#ffffff", padding: "32px", maxWidth: "560px", margin: "24px auto" } as const;
const h1 = { fontSize: "20px", color: "#101c2c" } as const;
const facts = { fontSize: "14px", lineHeight: "22px" } as const;
const line = { margin: 0 } as const;
const button = {
  backgroundColor: "#b7853a",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "6px",
  fontSize: "14px",
  textDecoration: "none",
} as const;
const foot = { fontSize: "12px", color: "#6b6b6b" } as const;

function Stay(p: Common) {
  return (
    <Section style={facts}>
      <Text style={line}>
        <strong>Property:</strong> {p.propertyName}
      </Text>
      <Text style={line}>
        <strong>Dates:</strong> {p.checkIn} → {p.checkOut} ({p.nights} nights)
      </Text>
    </Section>
  );
}

function Footer({ supportEmail }: { supportEmail: string }) {
  return (
    <>
      <Hr />
      <Text style={foot}>
        Questions? Reply to this email or write to {supportEmail}. Live Luxe Pty Ltd — partner accommodation.
      </Text>
    </>
  );
}

function Shell({ title, preview, children }: { title: string; preview: string; children: React.ReactNode }) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading as="h1" style={h1}>
            {title}
          </Heading>
          {children}
        </Container>
      </Body>
    </Html>
  );
}

/** §17.2 "Card authorisation fails": plain-language reason, prompt to try another method. */
export function CardDeclined(p: Common & { reasonText: string; payUrl: string; holdUntilLabel: string | null }) {
  return (
    <Shell title={`Card not authorised — ${p.reference}`} preview={`Card not authorised — ${p.reference}`}>
      <Text>
        We could not place the hold for your request at <strong>{p.propertyName}</strong>. {p.reasonText} No money has
        been taken.
      </Text>
      <Stay {...p} />
      {p.holdUntilLabel && (
        <Text style={facts}>
          The dates stay reserved for you until {p.holdUntilLabel}; Live Luxe will review the request once a card is
          held.
        </Text>
      )}
      <Button href={p.payUrl} style={button}>
        Try another card
      </Button>
      <Footer supportEmail={p.supportEmail} />
    </Shell>
  );
}

/** §17.2 "3DS challenge abandoned": a resume link back to the same request. */
export function ResumePayment(p: Common & { payUrl: string; holdUntilLabel: string | null }) {
  return (
    <Shell
      title={`Finish securing your request — ${p.reference}`}
      preview={`Finish securing your request — ${p.reference}`}
    >
      <Text>
        Your request for <strong>{p.propertyName}</strong> is saved, but the card step was not completed, so Live Luxe
        cannot review it yet.
      </Text>
      <Stay {...p} />
      {p.holdUntilLabel && <Text style={facts}>The dates are held for you until {p.holdUntilLabel}.</Text>}
      <Button href={p.payUrl} style={button}>
        Resume where you left off
      </Button>
      <Footer supportEmail={p.supportEmail} />
    </Shell>
  );
}

/** §17.2 "Authorisation expires before approval": the hold was released by the card network. */
export function HoldReleased(p: Common & { payUrl: string; approved: boolean; holdUntilLabel: string | null }) {
  return (
    <Shell title={`Card hold released — ${p.reference}`} preview={`Card hold released — ${p.reference}`}>
      <Text>
        The temporary hold on your card for <strong>{p.propertyName}</strong> was released by your bank — card holds
        only last about a week, and no money was taken.{" "}
        {p.approved ? "Live Luxe has approved the request, so" : "To keep the request moving,"} please place a new hold.
      </Text>
      <Stay {...p} />
      {p.holdUntilLabel && <Text style={facts}>The dates remain reserved for you until {p.holdUntilLabel}.</Text>}
      <Button href={p.payUrl} style={button}>
        Place a new card hold
      </Button>
      <Footer supportEmail={p.supportEmail} />
    </Shell>
  );
}

/** §17.5 "Nobody approves a request": at 150 % of the SLA the hold is extended and the partner told the truth. */
export function StillReviewing(p: Common & { requestUrl: string; holdUntilLabel: string | null }) {
  return (
    <Shell title={`Still with us — ${p.reference}`} preview={`Your request is still being reviewed — ${p.reference}`}>
      <Text>
        Your request for <strong>{p.propertyName}</strong> has taken longer than our usual response time. It has not
        been dropped: the dates are still held for you and the request has been escalated inside Live Luxe.
      </Text>
      <Stay {...p} />
      {p.holdUntilLabel && <Text style={facts}>Hold extended until {p.holdUntilLabel}.</Text>}
      <Button href={p.requestUrl} style={button}>
        View request
      </Button>
      <Footer supportEmail={p.supportEmail} />
    </Shell>
  );
}

/** §10.6 check-in pack released. */
export function CheckinReady(
  p: Common & { requestUrl: string; guestName: string | null; doorCodeFromLabel?: string | null },
) {
  return (
    <Shell title={`Check-in details ready — ${p.reference}`} preview={`Check-in details ready — ${p.reference}`}>
      <Text>
        The access details for <strong>{p.propertyName}</strong>
        {p.guestName ? ` (${p.guestName})` : ""} are now available in the portal. For security they are shown there
        rather than in this email, and each view is logged.
        {p.doorCodeFromLabel ? ` The door code appears there from ${p.doorCodeFromLabel}.` : ""}
      </Text>
      <Stay {...p} />
      <Button href={p.requestUrl} style={button}>
        View check-in details
      </Button>
      <Footer supportEmail={p.supportEmail} />
    </Shell>
  );
}

/** §10.6 extension / early departure decided. */
export function ModificationDecided(
  p: Common & {
    kind: "extension" | "early_departure";
    approved: boolean;
    newCheckOut: string;
    moneyLabel: string;
    note: string | null;
    requestUrl: string;
    invoiceUrl: string | null;
  },
) {
  const what = p.kind === "extension" ? "extension" : "early departure";
  const title = `${p.approved ? "Approved" : "Not approved"}: ${what} — ${p.reference}`;
  return (
    <Shell title={title} preview={title}>
      <Text>
        {p.approved
          ? `Live Luxe has approved the ${what} for ${p.propertyName}. The booking now ends on ${p.newCheckOut}.`
          : `Live Luxe could not approve the ${what} for ${p.propertyName}. The booking is unchanged.`}
      </Text>
      <Stay {...p} />
      <Text style={facts}>
        <strong>{p.kind === "extension" ? "Charge" : "Refund"}:</strong> {p.moneyLabel}
      </Text>
      {p.note && <Text style={{ ...facts, fontStyle: "italic" }}>“{p.note}”</Text>}
      <Button href={p.invoiceUrl ?? p.requestUrl} style={button}>
        {p.invoiceUrl ? "View the invoice" : "View booking"}
      </Button>
      <Footer supportEmail={p.supportEmail} />
    </Shell>
  );
}
