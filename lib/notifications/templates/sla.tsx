/** Internal ops email for the SLA escalation ladder — spec §10.5 (50 % rung). */
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

const shell = { fontFamily: "Helvetica, Arial, sans-serif", backgroundColor: "#f4efe6", margin: 0 } as const;
const card = { backgroundColor: "#ffffff", padding: "32px", maxWidth: "560px", margin: "24px auto" } as const;
const h1 = { fontSize: "20px", color: "#101c2c" } as const;
const facts = { fontSize: "14px", lineHeight: "22px" } as const;
const button = {
  backgroundColor: "#101c2c",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "6px",
  fontSize: "14px",
  textDecoration: "none",
} as const;

export function SlaEscalation(p: {
  reference: string;
  label: string;
  org: string;
  property: string;
  dueLabel: string;
  url: string;
  rung: number;
}) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>{`${p.label} — ${p.reference}`}</Preview>
      <Body style={shell}>
        <Container style={card}>
          <Heading as="h1" style={h1}>
            {p.label} — {p.reference}
          </Heading>
          <Text style={facts}>
            {p.org} · {p.property}
            <br />
            Decision due: {p.dueLabel} ({p.rung}% of the window elapsed)
          </Text>
          <Button href={p.url} style={button}>
            Open in the queue
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
