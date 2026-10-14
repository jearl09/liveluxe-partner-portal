import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
                                ListFlowable, ListItem, KeepTogether)

OUT = r"D:\WORK PROJECTS\livluxe-partner-portal\docs\guides\Livluxe-Partner-Portal-User-Guide.pdf"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
SITE = "https://liveluxe-partner-portal.vercel.app"

NAVY = colors.HexColor("#101c2c")
GOLD = colors.HexColor("#b7853a")
CREAM = colors.HexColor("#f4efe6")
INK = colors.HexColor("#333333")
MUTED = colors.HexColor("#6b6b6b")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=20, textColor=NAVY, spaceBefore=6, spaceAfter=10)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=14, textColor=NAVY, spaceBefore=14, spaceAfter=6)
H3 = ParagraphStyle("H3", parent=ss["Heading3"], fontName="Helvetica-Bold", fontSize=11, textColor=GOLD, spaceBefore=10, spaceAfter=4)
BODY = ParagraphStyle("Body", parent=ss["Normal"], fontName="Helvetica", fontSize=10, leading=14, textColor=INK, spaceAfter=6)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=8.5, leading=11, textColor=MUTED)
STEP = ParagraphStyle("Step", parent=BODY, spaceAfter=3)
TIP = ParagraphStyle("Tip", parent=BODY, backColor=CREAM, borderPadding=6, leftIndent=4, spaceBefore=4, spaceAfter=10)
COVER_T = ParagraphStyle("CoverT", parent=H1, fontSize=30, leading=36, spaceBefore=0, textColor=NAVY)
COVER_S = ParagraphStyle("CoverS", parent=BODY, fontSize=13, leading=18, textColor=MUTED)

def P(t, s=BODY): return Paragraph(t, s)

def steps(items):
    return ListFlowable([ListItem(P(i, STEP), leftIndent=14) for i in items], bulletType="1", bulletFontName="Helvetica-Bold",
                        bulletFontSize=10, bulletColor=GOLD, leftIndent=18, spaceAfter=8)

def bullets(items):
    return ListFlowable([ListItem(P(i, STEP), leftIndent=12) for i in items], bulletType="bullet", bulletColor=GOLD,
                        leftIndent=14, spaceAfter=8)

def tip(t): return P("<b>Tip.</b> " + t, TIP)

def table(rows, widths):
    t = Table([[P(c, SMALL if r else ParagraphStyle("th", parent=SMALL, fontName="Helvetica-Bold", textColor=colors.white)) for c in row] for r, row in enumerate(rows)], colWidths=widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d9d2c4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    t.spaceAfter = 10
    return t

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 12 * mm, "Live Luxe Partner Portal · User guide · v1 (14 Oct 2026)")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {doc.page}")
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.8)
    canvas.line(20 * mm, 16 * mm, A4[0] - 20 * mm, 16 * mm)
    canvas.restoreState()

def cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 60 * mm, A4[0], 60 * mm, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(0, A4[1] - 62 * mm, A4[0], 2 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 26)
    canvas.drawString(20 * mm, A4[1] - 36 * mm, "LIVE LUXE")
    canvas.setFont("Helvetica", 12)
    canvas.drawString(20 * mm, A4[1] - 46 * mm, "Partner Booking Portal")
    footer(canvas, doc)
    canvas.restoreState()

story = []
# ------------------------------------------------------------------ cover
story += [
    Spacer(1, 70 * mm),
    P("Partner Portal<br/>User Guide", COVER_T),
    Spacer(1, 10),
    P("Step-by-step instructions for partner organisations (insurers, corporates, government) and for the Live Luxe operations team.", COVER_S),
    Spacer(1, 30),
    P(f"<b>Website:</b> {SITE}", BODY),
    P("<b>Support:</b> contact@liveluxeau.com", BODY),
    Spacer(1, 20),
    P("Part 1 — For partners<br/>Part 2 — For the Live Luxe operations team<br/>Part 3 — Glossary and FAQ", BODY),
    PageBreak(),
]

# ------------------------------------------------------------------ PART 1
story += [P("Part 1 — Partner guide", H1),
          P("The portal lets your organisation find a Live Luxe property, request it for a guest, pay, and manage the stay. "
            "Nothing is booked until Live Luxe approves your request, and nothing is charged until then either.", BODY)]

story += [P("1. Signing in for the first time", H2), steps([
    "You receive an email <b>“You are invited to the Live Luxe partner portal”</b>. Click <b>Accept invitation</b>. The link works once and expires after 7 days.",
    "Choose a password (at least 12 characters) and click <b>Create account</b>.",
    f"From then on go to <b>{SITE}/login</b>, enter your email and password and click <b>Sign in</b>.",
    "Forgot it? Click <b>Reset password</b> on the login page and follow the email.",
    "Optional but recommended: <b>Settings → Security → Turn on two-factor authentication</b> and scan the QR code with Google Authenticator or similar.",
]), tip("If the invitation email has not arrived, check spam for a message from bookings@booking.liveluxe.au, or ask your organisation’s administrator to resend it from the Team page.")]

story += [P("2. The dashboard", H2),
          P("After signing in you land on the <b>Dashboard</b>. It shows:", BODY), bullets([
    "<b>Needs your attention</b> — requests waiting on you (a counter-offer to answer, a payment to make).",
    "Four tiles: requests in review, confirmed stays, upcoming check-ins, invoices due. Click a tile to open the filtered list.",
    "<b>Next 7 days</b> — arrivals and departures with a note when check-in details are ready.",
    "<b>Recent activity</b> — what changed, with the time in Melbourne time.",
]), P("The top menu is the same on every page: <b>Dashboard · Search · Requests · Invoices · Team · Settings</b>.", BODY)]

story += [P("3. Finding a property", H2), steps([
    "Click <b>Search</b>.",
    "Enter <b>Check-in</b> and <b>Check-out</b> dates, number of <b>Adults</b>, <b>Children</b> and <b>Pets</b>, and optionally a suburb (for example “Docklands”) or bedrooms. Click <b>Search</b>.",
    "Results show only properties that are free for the whole stay. Each card shows the suburb, bedrooms, sleeps, and the nightly rate for your dates.",
    "Use the map to see the general area. Exact addresses are shown only after a booking is approved.",
    "Click a property to open its page: photos, description, house rules, amenities, check-in window and the full <b>Quote</b> for your dates (nightly rate, cleaning fee, GST, total).",
]), tip("The freshness pill (“Availability updated 12 min ago”) tells you how current the calendar is. The quote you see is held for 48 hours.")]

story += [P("4. Requesting a booking", H2), steps([
    "On the property page click <b>Request to book</b>.",
    "Fill in the <b>Guest</b> section: guest name (required), email and phone (optional but helpful for check-in).",
    "Fill in <b>Your references</b>: claim reference and/or PO number (your organisation may make one of these compulsory), and a cost centre if you use them.",
    "Add <b>Notes</b> for the Live Luxe team: access needs, arrival time, anything unusual.",
    "Tick the confirmation box and click <b>Submit request</b>.",
    "<b>If your organisation pays by card:</b> you are taken to a secure payment page. Enter the card and click <b>Secure with a card hold</b>. This places a hold only; the card is charged when Live Luxe approves. If nothing is approved the hold simply drops off.",
    "<b>If your organisation pays by invoice:</b> there is no card step. The request goes straight to Live Luxe.",
    "You land on the request page with a reference like <b>LLX-2026-000012</b>. Keep this reference for any query.",
]), tip("Live Luxe aims to answer within the service window shown on the request page (“Decision due by …”). The dates are held for you until then.")]

story += [P("5. What happens next", H2),
          P("Open <b>Requests</b> at any time. Each request shows a status pill. The timeline at the bottom of a request lists every step with the time.", BODY),
          table([
              ["Status", "Meaning", "What you need to do"],
              ["Submitted / Under review", "Live Luxe is looking at it. Dates are held.", "Nothing. You will be emailed."],
              ["Counter-offered", "Live Luxe proposed different dates or a different price.", "Open the request and click <b>Accept the proposal</b> or <b>Decline and close</b>."],
              ["Approved", "Accepted. Payment and the reservation are being finalised.", "Nothing, it confirms by itself within a minute."],
              ["Awaiting payment", "Approved, but the card could not be charged.", "Open the request and pay with a card."],
              ["Confirmed", "Booked. Tax invoice issued.", "Pass the check-in details to the guest when they appear."],
              ["Checked in / Completed", "The stay is under way or finished.", "Nothing."],
              ["Declined", "Live Luxe could not take it. The reason is shown.", "Search again for alternatives."],
              ["Expired", "The hold lapsed before a decision or payment.", "Submit again if still needed."],
              ["Cancelled", "Cancelled by you or by Live Luxe. Refund shown on the page.", "Nothing."],
          ], [38 * mm, 70 * mm, 62 * mm])]

story += [P("6. Check-in details", H2), steps([
    "Once a booking is <b>Confirmed</b>, the request page shows a <b>Check-in details</b> box with the full street address, parking notes and the check-in window.",
    "The <b>Access pack</b> (door code, Wi-Fi name and password, entry instructions, emergency contact) appears automatically 48 hours before check-in. You receive an email <b>“Check-in details ready”</b> at that moment.",
    "Pass these details to the guest directly. The portal records who viewed them and when, so please do not forward screenshots to anyone outside the booking.",
    "The access pack disappears 24 hours after check-out.",
]), tip("Need the code earlier, for example a late-night arrival? Email contact@liveluxeau.com with the booking reference and the team can release it early.")]

story += [P("7. Changing a stay", H2),
          P("On a confirmed booking the <b>Changes to the stay</b> box lets you:", BODY), bullets([
    "<b>Extend</b> — enter the new check-out date and click <b>Check availability</b>. Only the extra nights are quoted. Live Luxe approves it, the dates are updated and a supplementary invoice is issued. If the property is not free, the portal lists nearby alternatives.",
    "<b>Leave early</b> — enter the new check-out date and click <b>Send</b>. Live Luxe confirms the refund for the unused nights under the cancellation policy and the money goes back to the original card or as a credit against the invoice.",
]), P("You are emailed when Live Luxe decides either request.", BODY)]

story += [P("8. Cancelling", H2), steps([
    "Open the request and scroll to the <b>Cancellation</b> box. It shows days to check-in, what the policy retains and the refund you would receive.",
    "<b>Before Live Luxe decides:</b> click <b>Withdraw request</b>. The dates and any card hold are released at once; nothing is charged.",
    "<b>Confirmed and more than 14 days out:</b> click <b>Cancel booking</b>, choose a reason, confirm. The refund is sent to the original card within 5 to 10 business days and a credit note is issued against the invoice.",
    "<b>Confirmed and inside 14 days:</b> you can only <b>Send cancellation request</b>. Live Luxe reviews it against the policy and emails you the outcome.",
])]

story += [P("9. Invoices and payments", H2), bullets([
    "<b>Invoices</b> lists one tax invoice per confirmed booking with its status: Paid, Due, Overdue, Void.",
    "Click <b>PDF</b> to download, or <b>Pay invoice</b> to pay a due invoice online by card or bank transfer (invoice-terms organisations).",
    "Card organisations are charged on approval and the invoice is marked paid automatically.",
    "Invoice-terms organisations have 14 days (or as agreed). Reminders go to your billing contact; bookings may need finance approval if invoices fall far behind.",
])]

story += [P("10. Managing your team", H2),
          P("Administrators see extra options on <b>Team</b>:", BODY), steps([
    "Click <b>Invite</b>, enter the colleague’s work email and pick a role: <b>Booker</b> (can search and request), <b>Viewer</b> (read only), <b>Administrator</b> (can also manage people and see all invoices).",
    "They receive the invitation email and set up their own password.",
    "To remove access, open the person and click <b>Remove access</b>. Their past requests remain visible to the organisation.",
]), PageBreak()]

# ------------------------------------------------------------------ PART 2
story += [P("Part 2 — Live Luxe operations guide", H1),
          P(f"Sign in at <b>{SITE}/login</b> with a Live Luxe account. Operations users see a navy header with "
            "<b>Queue · Bookings · Partners · Rate cards · Settings</b>. Turn on two-factor authentication under Settings before doing anything else.", BODY)]

story += [P("1. The queue", H2), bullets([
    "<b>Queue</b> lists every request waiting on Live Luxe, most urgent first. The colour shows the service-level clock: green on track, amber past 80 % of the window, red breached, grey paused (waiting on the partner).",
    "Filter by partner, by band, or search a reference or guest name.",
    "Slack <b>#bookings</b> gets a post for every new request; <b>#alerts</b> gets anything that needs urgent attention (payment failures, Hostaway problems, breached SLAs).",
])]

story += [P("2. Deciding a request", H2), steps([
    "Click the request to open it. You see the partner, guest, references, notes, the quote, the payment state and the timeline.",
    "Check the <b>Payment</b> box: a card request must show <b>Hold placed</b>; an invoice-terms partner shows <b>Invoice terms</b>. Approval is blocked until a card hold exists for card partners.",
    "Click <b>Start review</b> if you want to take ownership; the SLA clock keeps running.",
    "<b>Approve</b>: click <b>Approve</b>. The portal creates the Hostaway reservation, charges the card (or issues the invoice), moves the booking to Confirmed and emails the partner. The page updates within a few seconds.",
    "<b>Counter-offer</b>: open <b>Counter-offer</b>, change the total and/or the dates, add a message, click <b>Send counter-offer</b>. The SLA pauses while the partner answers. They accept or decline from their side.",
    "<b>Decline</b>: open <b>Decline</b>, pick a reason, optionally suggest alternatives, click <b>Decline</b> and confirm. The dates and card hold are released and the partner is emailed.",
]), tip("A request flagged <b>Needs finance approval</b> (credit limit, over the ops value ceiling, or overdue invoices) can only be approved by a finance or admin user.")]

story += [P("3. After approval", H2), bullets([
    "<b>Approved</b> normally becomes <b>Confirmed</b> within a minute. If it stays Approved, the Hostaway write is being retried; after 5 minutes an alert goes to #alerts with the error shown on the booking page.",
    "<b>Awaiting payment</b> means the card was declined at capture. The partner has been emailed a payment link; the hold on the dates is kept for the grace period.",
    "<b>Failed</b> means Hostaway refused the reservation outright. Nothing was charged. Call the partner and offer an alternative.",
])]

story += [P("4. Check-in pack", H2), steps([
    "Every confirmed booking shows a <b>Check-in details</b> box with the release time (48 hours before check-in by default; some properties have their own offset).",
    "To release early, click <b>Release access pack now</b> and confirm. The partner is emailed and the codes appear on their page immediately.",
    "The box lists <b>Pack views</b>: who on the partner side opened the codes, when, and from which IP address.",
    "If a booking is cancelled after the pack was released, #alerts asks you to rotate the door code and Wi-Fi password in Hostaway.",
])]

story += [P("5. Cancellations, extensions and early departures", H2), bullets([
    "<b>Cancellation</b> box: shows days to check-in, policy retention and the refund. Pick a reason and click <b>Cancel booking</b>. The portal cancels the Hostaway reservation, refunds the card, issues a credit note and emails the partner. Finance and admin users can type a different <b>Refund amount</b>; it cannot exceed what was captured.",
    "A yellow <b>Partner requested cancellation</b> banner means they are inside the cut-off. Decide in the Cancellation box.",
    "<b>Changes to the stay</b> box: extension and early-departure requests from the partner appear here with the amount. Click <b>Approve</b> (the portal re-checks availability live, updates Hostaway and raises the supplementary invoice or refund) or <b>Decline</b> with a note.",
    "While a Stripe dispute is open on a booking, automated refunds are frozen and a banner says so. The evidence pack is attached to the dispute record for finance.",
])]

story += [P("6. Partners and rate cards", H2), steps([
    "<b>Partners → New partner</b>: legal name, ABN, type, billing email and finance contact, payment terms (card prepay, deposit, Net 14, Net 30), deposit % if applicable, credit limit, whether a PO number or claim reference is compulsory, service window hours.",
    "On the partner page click <b>Invite</b> to send the first administrator their invitation. Resend or revoke from the same page.",
    "<b>Rate cards</b>: create a card for a partner (nightly rate adjustments, fees, minimum nights), then <b>Publish</b>. Published cards apply to new quotes from that moment; existing quotes keep their price.",
    "<b>Credit standing</b> moves automatically with overdue invoices: Good → Watch → Finance approval → Suspended, and back to Good when paid.",
])]

story += [P("7. Finance", H2), bullets([
    "Every confirmed booking has a Stripe tax invoice; the <b>Payment</b> box links to it and to the PDF.",
    "Overdue reminders go out automatically on days 1, 7 and 14 past due; finance is copied at escalation.",
    f"Nightly reconciliation compares the portal with Stripe and Hostaway. Exceptions older than 24 hours post to #alerts. Download the Stripe reconciliation as a spreadsheet at <b>{SITE}/api/admin/reconciliation?format=csv</b> (finance or admin login).",
])]

story += [P("8. Settings", H2), bullets([
    "<b>Settings → Security</b>: your own password and two-factor authentication.",
    "Business rules (hold hours, service window, deposit %, cancellation cut-off and retention tiers, GST) live in the settings table and are changed by the engineering team on request. They take effect for new requests immediately.",
]), PageBreak()]

# ------------------------------------------------------------------ PART 3
story += [P("Part 3 — Glossary and FAQ", H1)]
story += [table([
    ["Term", "Meaning"],
    ["Hold", "A temporary reservation of the dates (and, for card partners, a pre-authorisation on the card) while Live Luxe decides. Nothing is charged by a hold."],
    ["Quote", "The price for a specific stay, frozen for 48 hours. Includes accommodation, cleaning fee and GST."],
    ["Service window / SLA", "The time Live Luxe commits to answer a request. The clock pauses while a counter-offer is with the partner."],
    ["Counter-offer", "Live Luxe proposing different dates or a different price instead of a straight approve or decline."],
    ["Access pack", "Door code, Wi-Fi and entry instructions. Released 48 hours before check-in, hidden 24 hours after check-out."],
    ["Cut-off", "The number of days before check-in (14 by default) inside which a partner cannot cancel without Live Luxe’s approval."],
    ["Credit note", "Stripe’s record that part or all of an invoice was refunded or waived."],
    ["Net 14", "Invoice payment terms: due 14 days after the invoice is issued."],
], [40 * mm, 130 * mm])]

story += [P("Frequently asked questions", H2)]
faq = [
    ("I cannot see the exact address.", "Addresses appear only once a booking is approved. Before that the map shows the general area."),
    ("The card was charged but the status still says Approved.", "Give it a minute; the page refreshes itself. If it is still Approved after 5 minutes, Live Luxe has already been alerted and will be in touch."),
    ("Can I book for someone outside my organisation?", "Yes, the guest does not need an account. Enter their details in the Guest section; they never log in."),
    ("How do I get a copy of an invoice?", "Invoices → PDF next to the booking, or the link in the confirmation email."),
    ("When will a refund arrive?", "Card refunds show on the statement within 5 to 10 business days. Invoice credits appear on the invoice immediately."),
    ("Who do I contact?", "Reply to any portal email, or write to contact@liveluxeau.com quoting the booking reference (LLX-…)."),
]
for q, a in faq:
    story.append(KeepTogether([P(q, H3), P(a, BODY)]))

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=24 * mm,
                        title="Live Luxe Partner Portal — User Guide", author="Live Luxe Pty Ltd")
doc.build(story, onFirstPage=cover, onLaterPages=footer)
print("written", OUT, os.path.getsize(OUT), "bytes")
