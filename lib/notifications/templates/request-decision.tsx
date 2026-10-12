/**
 * Templates for the three ops decisions — Appendix D:
 *   request_approved  "Approved — {reference}"
 *   request_declined  "Update on your request — {reference}"
 *   counter_offer     "Proposal for your request — {reference}"
 * Each carries the booking reference in subject and body, one primary action and a human contact.
 */
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

interface Common {
  reference: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestsSummary: string;
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

function Stay(p: Common) {
  return (
    <Section style={facts}>
      <Text style={line}>
        <strong>Property:</strong> {p.propertyName}
      </Text>
      <Text style={line}>
        <strong>Dates:</strong> {p.checkIn} → {p.checkOut} ({p.nights} nights)
      </Text>
      <Text style={line}>
        <strong>Guests:</strong> {p.guestsSummary}
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

export interface RequestApprovedProps extends Common {
  totalFormatted: string;
  /** What happens next, e.g. "Payment and confirmation follow in the portal." */
  nextStep: string;
}

export function RequestApproved(p: RequestApprovedProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>Approved — {p.reference}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading as="h1" style={h1}>
            Approved — {p.reference}
          </Heading>
          <Text>
            Good news: Live Luxe has approved your request for <strong>{p.propertyName}</strong>. The dates are reserved
            for your organisation.
          </Text>
          <Stay {...p} />
          <Text style={facts}>
            <strong>Total:</strong> {p.totalFormatted}
          </Text>
          <Text>{p.nextStep}</Text>
          <Button href={p.requestUrl} style={button}>
            View request
          </Button>
          <Footer supportEmail={p.supportEmail} />
        </Container>
      </Body>
    </Html>
  );
}

export interface RequestDeclinedProps extends Common {
  reasonLabel: string;
  note?: string;
  searchUrl: string;
}

export function RequestDeclined(p: RequestDeclinedProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>Update on your request — {p.reference}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading as="h1" style={h1}>
            Update on your request — {p.reference}
          </Heading>
          <Text>
            We&apos;re sorry — Live Luxe is unable to accommodate this request for <strong>{p.propertyName}</strong>.
            The hold on the dates has been released.
          </Text>
          <Stay {...p} />
          <Text style={facts}>
            <strong>Reason:</strong> {p.reasonLabel}
          </Text>
          {p.note && <Text style={{ ...facts, fontStyle: "italic" }}>“{p.note}”</Text>}
          <Text>Other properties may suit these dates. Search again from the portal, or reply and we will help.</Text>
          <Button href={p.searchUrl} style={button}>
            Search other properties
          </Button>
          <Footer supportEmail={p.supportEmail} />
        </Container>
      </Body>
    </Html>
  );
}

export interface CounterOfferProps extends Common {
  message: string;
  previousTotalFormatted: string | null;
  newTotalFormatted: string;
  datesChanged: boolean;
  respondByLabel: string;
}

export function CounterOffer(p: CounterOfferProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>Proposal for your request — {p.reference}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading as="h1" style={h1}>
            Proposal for your request — {p.reference}
          </Heading>
          <Text>
            Live Luxe has proposed a change to your request for <strong>{p.propertyName}</strong>. Nothing is confirmed
            until you accept it in the portal.
          </Text>
          <Text style={{ ...facts, fontStyle: "italic" }}>“{p.message}”</Text>
          <Stay {...p} />
          <Section style={facts}>
            {p.datesChanged && (
              <Text style={line}>
                <strong>Dates:</strong> changed — see above
              </Text>
            )}
            <Text style={line}>
              <strong>New total:</strong> {p.newTotalFormatted}
              {p.previousTotalFormatted && p.previousTotalFormatted !== p.newTotalFormatted
                ? ` (was ${p.previousTotalFormatted})`
                : ""}
            </Text>
            <Text style={line}>
              <strong>Respond by:</strong> {p.respondByLabel}
            </Text>
          </Section>
          <Button href={p.requestUrl} style={button}>
            Review and respond
          </Button>
          <Footer supportEmail={p.supportEmail} />
        </Container>
      </Body>
    </Html>
  );
}
