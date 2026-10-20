/**
 * Payment and confirmation emails — Appendix D:
 *   payment_required   "Payment needed — {reference}"
 *   booking_confirmed  "Confirmed — {reference}"
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

export interface PaymentRequiredProps extends Common {
  totalFormatted: string;
  /** Why we are asking, e.g. "The card hold placed at request time has lapsed." */
  reason: string;
  payUrl: string;
  /** When the dates stop being held, already formatted. */
  holdUntilLabel: string | null;
}

export function PaymentRequired(p: PaymentRequiredProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>Payment needed — {p.reference}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading as="h1" style={h1}>
            Payment needed — {p.reference}
          </Heading>
          <Text>
            Live Luxe has approved your request for <strong>{p.propertyName}</strong>, but we could not take payment.{" "}
            {p.reason}
          </Text>
          <Stay {...p} />
          <Text style={facts}>
            <strong>Amount:</strong> {p.totalFormatted}
          </Text>
          {p.holdUntilLabel && <Text style={facts}>The dates stay reserved for you until {p.holdUntilLabel}.</Text>}
          <Button href={p.payUrl} style={button}>
            Pay now
          </Button>
          <Footer supportEmail={p.supportEmail} />
        </Container>
      </Body>
    </Html>
  );
}

export interface BookingConfirmedProps extends Common {
  guestName: string | null;
  totalFormatted: string;
  /** "Paid by Visa ending 4242" or "Invoice LL-0001 due 12 Nov 2026". */
  paymentLabel: string;
  invoiceUrl: string | null;
  requestUrl: string;
  checkinReleaseLabel: string;
  /** Terms staff wrote into the quote (mandatory from 28 nights). */
  stayTerms?: string | null;
}

export function BookingConfirmed(p: BookingConfirmedProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>Confirmed — {p.reference}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading as="h1" style={h1}>
            Confirmed — {p.reference}
          </Heading>
          <Text>
            Your booking at <strong>{p.propertyName}</strong> is confirmed
            {p.guestName ? ` for ${p.guestName}` : ""}.
          </Text>
          <Stay {...p} />
          <Text style={facts}>
            <strong>Total:</strong> {p.totalFormatted}
            <br />
            <strong>Payment:</strong> {p.paymentLabel}
          </Text>
          {p.stayTerms && (
            <Text style={facts}>
              <strong>Terms for this stay:</strong> {p.stayTerms}
            </Text>
          )}
          <Text>{p.checkinReleaseLabel}</Text>
          <Button href={p.requestUrl} style={button}>
            View booking
          </Button>
          {p.invoiceUrl && (
            <Text style={facts}>
              <a href={p.invoiceUrl}>Download the tax invoice</a>
            </Text>
          )}
          <Footer supportEmail={p.supportEmail} />
        </Container>
      </Body>
    </Html>
  );
}

export interface BookingCancelledProps extends Common {
  /** "Your organisation" or "Live Luxe". */
  cancelledBy: string;
  reason: string | null;
  /** e.g. "A$1,837.00 refunded to Visa ending 4242 (3–5 business days)" or "No refund under the cancellation policy." */
  moneyLabel: string;
  requestUrl: string;
}

export function BookingCancelled(p: BookingCancelledProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>Cancelled — {p.reference}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading as="h1" style={h1}>
            Cancelled — {p.reference}
          </Heading>
          <Text>
            {p.cancelledBy} cancelled the booking at <strong>{p.propertyName}</strong>. The dates have been released.
          </Text>
          <Stay {...p} />
          <Text style={facts}>
            <strong>Refund:</strong> {p.moneyLabel}
          </Text>
          {p.reason && <Text style={{ ...facts, fontStyle: "italic" }}>“{p.reason}”</Text>}
          <Button href={p.requestUrl} style={button}>
            View booking
          </Button>
          <Footer supportEmail={p.supportEmail} />
        </Container>
      </Body>
    </Html>
  );
}
