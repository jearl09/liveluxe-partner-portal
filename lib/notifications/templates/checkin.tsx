/**
 * Check-in pack released — Appendix D "Check-in pack released" (submitter).
 * Deliberately carries no codes: the pack lives behind login where every view is
 * logged (§8.4). The email gives the address, the arrival window and the link.
 */
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

export interface CheckinPackReleasedProps {
  reference: string;
  propertyName: string;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  /** Full street address, or null when the listing has none on file. */
  addressLine: string | null;
  arrivalWindow: string | null;
  checkoutBy: string | null;
  requestUrl: string;
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

export function CheckinPackReleased(p: CheckinPackReleasedProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>Check-in details ready — {p.reference}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading as="h1" style={h1}>
            Check-in details ready — {p.reference}
          </Heading>
          <Text>
            The access details for <strong>{p.propertyName}</strong>
            {p.guestName ? ` (${p.guestName})` : ""} are now available in the partner portal.
          </Text>
          <Section style={facts}>
            <Text style={line}>
              <strong>Dates:</strong> {p.checkIn} → {p.checkOut} ({p.nights} nights)
            </Text>
            {p.addressLine && (
              <Text style={line}>
                <strong>Address:</strong> {p.addressLine}
              </Text>
            )}
            {p.arrivalWindow && (
              <Text style={line}>
                <strong>Check-in:</strong> {p.arrivalWindow}
              </Text>
            )}
            {p.checkoutBy && (
              <Text style={line}>
                <strong>Checkout:</strong> by {p.checkoutBy}
              </Text>
            )}
          </Section>
          <Text>
            Door code, Wi-Fi and entry instructions are shown on the booking page only, so they stay out of inboxes.
            Please pass them to the guest directly.
          </Text>
          <Button href={p.requestUrl} style={button}>
            Open check-in details
          </Button>
          <Hr />
          <Text style={foot}>
            Questions or problems getting in? Reply to this email or write to {p.supportEmail}. Live Luxe Pty Ltd —
            partner accommodation.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
