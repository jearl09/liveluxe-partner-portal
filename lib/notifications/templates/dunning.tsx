/**
 * Invoice reminders — Appendix D (invoice_overdue), §17.2 "Invoice unpaid past terms".
 * Each reminder says plainly what happens next and when, well before it does.
 */
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

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
const warn = { fontSize: "14px", lineHeight: "22px", color: "#8a2a1f" } as const;

export interface InvoiceReleaseWarningProps {
  reference: string;
  propertyName: string;
  invoiceNumber: string;
  amountFormatted: string;
  dueLabel: string;
  checkInLabel: string;
  payUrl: string;
  supportEmail: string;
}

/** Sent `invoice.release_warning_days` before an unpaid net-terms invoice releases the booking. */
export function InvoiceReleaseWarning(p: InvoiceReleaseWarningProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Invoice ${p.invoiceNumber} is due ${p.dueLabel} — booking ${p.reference} is released if unpaid`}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Text style={h1}>
            Invoice {p.invoiceNumber} is due {p.dueLabel}
          </Text>
          <Text style={facts}>
            Booking <strong>{p.reference}</strong> at <strong>{p.propertyName}</strong> (check-in {p.checkInLabel}) is
            on account. If the invoice is not paid by {p.dueLabel}, the booking is released and the dates go back on
            sale.
          </Text>
          <Section style={facts}>
            <Text style={line}>
              <strong>Amount:</strong> {p.amountFormatted}
            </Text>
            <Text style={line}>
              <strong>Due:</strong> {p.dueLabel}
            </Text>
          </Section>
          <Section style={{ margin: "20px 0" }}>
            <Button href={p.payUrl} style={button}>
              View and pay the invoice
            </Button>
          </Section>
          <Text style={facts}>
            If this has already been paid, or a PO or claim reference is holding it up, reply to this email before the
            due date and we will hold the booking.
          </Text>
          <Hr />
          <Text style={foot}>
            Questions? Reply to this email or write to {p.supportEmail}. Live Luxe Pty Ltd — partner accommodation.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export interface InvoiceReminderProps {
  orgName: string;
  invoiceNumber: string;
  amountFormatted: string;
  dueLabel: string;
  daysOverdue: number;
  payUrl: string;
  /** 0 = already in effect. */
  financeApprovalInDays: number;
  suspensionInDays: number;
  supportEmail: string;
}

export function InvoiceReminder(p: InvoiceReminderProps) {
  const financeLine =
    p.financeApprovalInDays === 0
      ? "New bookings for your organisation now require approval from Live Luxe finance."
      : `If it remains unpaid, new bookings will need Live Luxe finance approval in ${p.financeApprovalInDays} day${p.financeApprovalInDays === 1 ? "" : "s"}.`;
  const suspendLine =
    p.suspensionInDays === 0
      ? "New bookings are suspended until the account is brought up to date. Existing bookings are not affected."
      : `New bookings would be suspended ${p.suspensionInDays} day${p.suspensionInDays === 1 ? "" : "s"} from now; existing bookings are never affected.`;
  return (
    <Html>
      <Head />
      <Preview>{`Invoice ${p.invoiceNumber} is ${p.daysOverdue} days overdue`}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading style={h1}>Invoice {p.invoiceNumber} is overdue</Heading>
          <Section style={facts}>
            <Text style={line}>
              <strong>Organisation:</strong> {p.orgName}
            </Text>
            <Text style={line}>
              <strong>Amount outstanding:</strong> {p.amountFormatted}
            </Text>
            <Text style={line}>
              <strong>Was due:</strong> {p.dueLabel} ({p.daysOverdue} day{p.daysOverdue === 1 ? "" : "s"} ago)
            </Text>
          </Section>
          <Section style={{ margin: "20px 0" }}>
            <Button href={p.payUrl} style={button}>
              View and pay the invoice
            </Button>
          </Section>
          <Text style={warn}>{financeLine}</Text>
          <Text style={warn}>{suspendLine}</Text>
          <Text style={facts}>
            If this has already been paid, or a PO or claim reference is holding it up, reply to this email and we will
            sort it out.
          </Text>
          <Hr />
          <Text style={foot}>
            Questions? Reply to this email or write to {p.supportEmail}. Live Luxe Pty Ltd — partner accommodation.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
