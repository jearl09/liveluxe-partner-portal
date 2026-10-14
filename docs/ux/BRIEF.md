# Live Luxe Partner Portal — UI/UX Redesign Brief

Sections §1–§12 are the brief as issued on 14 Oct 2026: `../../Live Luxe Partner Portal — UI UX Redesign Brief.pdf`
(40 pages, repo root). That PDF is the source; this file does not restate it. Sections added after issue are
appended below and carry the same weight. Where an appended section and §1–§12 disagree, the appended section
wins for the screens it names.

---

## 13. Ease of use

_Added 14 Oct 2026 by the product owner. Binding for every Phase 2 screen._

**The bar.** A first-time partner user who has never been trained can find a property, price a stay and submit a
request in under five minutes without help. A new ops staff member can approve or decline a request on day one
without being shown how.

### Rules

1. **One obvious next step.** Every screen has one clear thing to do next, said in plain words near the top ("Find
   a property", "Review 3 requests", "Pay invoice"). If nothing needs doing, say so: "You're all caught up."
2. **Plain words over system words.** Write like you're talking to the person. "We'll reply by 3:00 pm today"
   beats "Decision SLA 4 business hours". Use the precise term in a tooltip or small print if it's needed.
3. **Explain before they wonder.** Wherever someone might hesitate, add one short line of help right there: why a
   hold exists, why the address is hidden, when they'll be charged, what "counter-offer" means. Small "?" tooltips
   for definitions, never a separate help page.
4. **Show progress through the process.** On the request detail page and the submit flow, show a simple step
   tracker: Submitted → Live Luxe reviewing → Approved → Confirmed → Check-in details sent, with where they are now
   highlighted.
5. **Fewer choices at once.** Show the 3–5 most-used filters and fields; put the rest under "More filters" / "More
   details". Smart defaults everywhere: tonight's date, 2 guests, partner's usual PO.
6. **Confirm what just happened.** After every action, a clear confirmation of what changed and what happens next
   ("Request sent. Live Luxe will reply by 3:00 pm. We've emailed you a copy.").
7. **Forgiving.** Warn before losing work, allow undo where safe, never clear a form on error, keep entered values
   when something fails.
8. **Big, clear targets.** Primary buttons full-width on mobile; nothing important hidden behind hover or icon-only
   buttons; every icon button has a text label or tooltip.
9. **First-visit help.** On a partner's first login, a short dismissible welcome card on the dashboard: three steps
   (Search → Request → We confirm) and who to call. Not a modal tour.
10. **No dead ends or dead links.** Fix the two 404s now: remove "New request on behalf of…" from the partner
    side, and make "Request a manual search" open a short form (dates, suburb, guests, notes) that posts as a
    comment/ticket to ops — or, if no endpoint exists, a prefilled email to ops — and log the gap in
    NEEDS_BACKEND.md.

### Test it

After each Phase 2 screen group, run a task test in the browser as a first-time user and write the result in
`docs/ux/USABILITY.md`:

- (a) partner places a family of 4 in Docklands for 30 nights from next Monday with a claim reference;
- (b) partner finds out when they'll get check-in details for an approved booking;
- (c) partner pays an overdue invoice;
- (d) ops approves the most urgent request;
- (e) ops declines one with a reason.

Record every point where you had to hunt, guess or read twice, and fix those before moving on.

### Order of work from here

Date picker, Sheet, Dialog, Toast, EmptyState, ErrorState, SyncState; then Phase 2 in the brief's order (§12.3).
