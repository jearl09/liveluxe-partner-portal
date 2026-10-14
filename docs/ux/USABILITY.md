# Usability task tests (brief §13)

Run with `scripts/ux-usability.mjs`, which acts as a first-time user: every control is found by its visible words,
and a **hunt** is logged whenever the obvious words were not there and a second look was needed. Times are wall
clock on the local dev server at 1440 px, including page loads. Screenshots of each step are kept locally, not
committed.

The five tasks:

- (a) partner places a family of 4 in Docklands for 30 nights from next Monday with a claim reference;
- (b) partner finds out when they'll get check-in details for an approved booking;
- (c) partner pays an overdue invoice;
- (d) ops approves the most urgent request;
- (e) ops declines one with a reason.

---

## After screen group 2 — request detail (14 Oct 2026)

Search, property and the request form are still the pre-redesign screens (group 4), so task (a) findings on those
screens are logged here and fixed in group 4. Everything on the request detail screen was fixed before moving on.

| Task | Result | Time | Hunts, guesses, re-reads                                                                                                                                                              |
| ---- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a)  | Pass   | 27 s | Property page button says "Request to book", not "Request this property". Card hold is a separate step after submitting (see below).                                                  |
| (b)  | Pass   | 8 s  | The approved booking was not in the default **Open** tab of Requests; found it under **Upcoming stays**. On the booking itself the answer is the first sentence, 360 px from the top. |
| (c)  | —      | —    | Not testable yet: the demo organisation pays by card and has no overdue invoice. Runs with screen group 5 (Invoices) against an invoice-terms partner.                                |
| (d)  | Pass   | 26 s | None. Queue → most urgent → Approve → the dialog lists what will happen → Approve and confirm. Ended Confirmed.                                                                       |
| (e)  | Pass   | 16 s | None. Decline → reason and note in the dialog → Decline request. Ended Declined.                                                                                                      |

### Found and fixed in this group

1. **The page promised a hold that did not exist.** After submitting in card mode the partner lands on the request
   page with no card held, yet the next-step sentence said "the dates are held … nothing is charged unless we
   approve". Ops cannot approve until the card is held. The sentence now reads **"One more step: hold your card"**
   with **Secure with a card hold** as the one gold action; ops see "Waiting for the partner's card hold".
2. **System words in the confirmation.** The submit toast said "within the decision window". Now: "Request sent.
   Live Luxe will reply within a few business hours, and we've emailed you a copy."
3. **Actions buried on phones.** With no primary action (a confirmed booking), Extend / Leave early / Ask to cancel
   sat below the whole record. Below 1024 px the action panel now follows the next-step card.
4. **Contradictory payment chip** ("Card hold · net 30") from mixing the request's old snapshot with the
   organisation's current terms; **"held"** shown for a released hold on a declined request; the **address
   repeated** when Hostaway's line already includes the postcode; **"Live Luxe (Live Luxe)"** in the timeline; routine
   system notes ("review started") in the ops timeline. All fixed.

### Logged for later groups

| Finding                                                                                                                                                         | Group | Brief        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------ |
| Approved and confirmed bookings are under the second tab ("Upcoming stays"); a first-time partner looks in "Open".                                              | 5     | §7.6, §13.1  |
| Search showed a property as free; submitting said "These dates are no longer available" with no next step (no nearby dates, no alternatives, no manual search). | 4     | §9.2, §13.10 |
| The request form clears the confirmation tick when the server bounces it back.                                                                                  | 4     | §13.7        |
| Card hold is a second step after submitting; the brief's flow takes the card in step 2 of the request ("Review and pay").                                       | 4     | §7.5         |
| Dates are typed into two native date boxes with no night count while choosing.                                                                                  | 4     | §4.5         |
| Property titles carry internal unit numbers ("2BR Penthouse (1903, 1906)").                                                                                     | 4     | §7.3         |

### Test-harness notes (not product findings)

- Stripe's Payment Element does not confirm in a headless browser (the "Link" panel takes focus and nothing is
  submitted); the same flow worked by hand on 13 Oct. Test card holds were placed by confirming the test-mode
  PaymentIntent with `pm_card_visa` server-side and then visiting the app's own return URL, which syncs it exactly as
  after a real hold.
