/**
 * Template: request_received — Appendix D.
 * Subject: "Request received — {reference}"
 * Must contain: property, dates, guests, total, claim/PO reference, submission
 * timestamp, stated decision SLA, link.
 */
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

export interface RequestReceivedProps {
  reference: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestsSummary: string;
  totalFormatted: string;
  claimRef?: string;
  poNumber?: string;
  submittedAtLabel: string; // e.g. "14 Sep 2026, 4:12 pm AEST"
  slaLabel: string; // e.g. "within 4 business hours"
  requestUrl: string;
  supportEmail: string;
}

export default function RequestReceived(p: RequestReceivedProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>Request received — {p.reference}</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif", backgroundColor: "#f6f5f2", margin: 0 }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", maxWidth: "560px", margin: "24px auto" }}>
          <Heading as="h1" style={{ fontSize: "20px", color: "#1a1a1a" }}>
            Request received — {p.reference}
          </Heading>
          <Text>
            Thanks — your booking request for <strong>{p.propertyName}</strong> has been received and is with the
            Livluxe operations team. You can expect a decision {p.slaLabel}.
          </Text>
          <Section style={{ fontSize: "14px", lineHeight: "22px" }}>
            <Text style={{ margin: 0 }}>
              <strong>Dates:</strong> {p.checkIn} → {p.checkOut} ({p.nights} nights)
            </Text>
            <Text style={{ margin: 0 }}>
              <strong>Guests:</strong> {p.guestsSummary}
            </Text>
            <Text style={{ margin: 0 }}>
              <strong>Total:</strong> {p.totalFormatted}
            </Text>
            {p.claimRef && (
              <Text style={{ margin: 0 }}>
                <strong>Claim reference:</strong> {p.claimRef}
              </Text>
            )}
            {p.poNumber && (
              <Text style={{ margin: 0 }}>
                <strong>PO number:</strong> {p.poNumber}
              </Text>
            )}
            <Text style={{ margin: 0 }}>
              <strong>Submitted:</strong> {p.submittedAtLabel}
            </Text>
          </Section>
          <Button
            href={p.requestUrl}
            style={{
              backgroundColor: "#1a1a1a",
              color: "#fff",
              padding: "12px 20px",
              borderRadius: "6px",
              marginTop: "16px",
            }}
          >
            View request
          </Button>
          <Hr style={{ margin: "24px 0" }} />
          <Text style={{ fontSize: "12px", color: "#666" }}>
            Need a person? Reply to this email or contact {p.supportEmail}. Reference {p.reference} in any
            correspondence.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
