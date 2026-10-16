# Partner portal demo: the whole flow, on the test site

A live walkthrough of everything a partner and Live Luxe do: joining, finding a property, requesting it, paying,
approval, the tax invoice, check-in details, a counter-offer and a decline. About 35 minutes.

Everything happens on the **test environment**: the test site, its test database, Stripe in test mode (no real
money) and Hostaway writes switched off (no real reservation is made; the portal records the booking and skips
the Hostaway step). Set up with `scripts/demo-setup.mjs`; wipe with `scripts/demo-reset.mjs` (end of this page).

Site: **https://liveluxe-partner-portal.vercel.app**

## Who is who

Use a separate browser window for each person, so nobody is signed in as someone else by accident.

| Window                                      | Person                     | Email                       | Role                                  | How the account is made                                                                       |
| ------------------------------------------- | -------------------------- | --------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| **A** (your normal browser)                 | Live Luxe admin            | claudia@liveluxeau.com      | Live Luxe administrator (ops console) | Already exists. You set the password with "Forgotten your password?", then turn on two-factor |
| **B** (a private/incognito window)          | Partner admin, then Booker | johnearlmandawe17@gmail.com | Demo Insurance Co, Administrator      | Invite email, sent by `demo-setup`                                                            |
| **B** (sign out, sign back in)              | Booker                     | your personal email 1       | Demo Insurance Co, Booker             | You invite them in step 1                                                                     |
| **C** (a second browser or another profile) | Finance                    | your personal email 2       | Demo Insurance Co, Finance            | You invite them in step 1                                                                     |

Demo Insurance Co only accepts invites to **@gmail.com** and **@liveluxeau.com** addresses.

Demo Insurance Co is set up as: Insurance · card held when a request is sent, charged only if approved · credit limit
AUD 5,000 (applies to invoice terms, not card bookings) · Live Luxe's usual decision deadline · claim reference
required, PO optional · **10% off** every stay (its rate card, effective 17 Oct 2026).

## The three properties

All in Docklands, single apartments with real nightly prices and photos. Several apartments share a building, so a
Docklands search shows more than one card with the same street name: open these by the link if in doubt.

| Use in the demo               | Title partners see                         | Free dates (check-in → check-out)                                                     | Link                                                                                                            |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Request 1: approve, 30 nights | **628 Flinders Street** · 2 bed · sleeps 4 | 24 Oct → 23 Nov (exactly 30 nights; booked 22–23 Oct and 23–25 Nov) · 26 Nov → 31 Dec | [/listings/18efae07…](https://liveluxe-partner-portal.vercel.app/listings/18efae07-2b20-44f1-ad1c-b2801baf0c48) |
| Request 2: counter-offer      | **673 La Trobe Street** · 1 bed · sleeps 2 | 19 Oct → 10 Dec                                                                       | [/listings/f065ecd5…](https://liveluxe-partner-portal.vercel.app/listings/f065ecd5-5d52-42b8-983c-fac617d6eb39) |
| Request 3: decline            | **677 La Trobe Street** · 2 bed · sleeps 4 | 25 Oct → 18 Nov · 29 Nov → 31 Dec                                                     | [/listings/563b7155…](https://liveluxe-partner-portal.vercel.app/listings/563b7155-0b60-4352-9c0b-377148d915ce) |

Free dates were read from the synced calendar on 17 Oct 2026. `node scripts/demo-setup.mjs` prints them again,
live, every time it runs; Hostaway can change them in between.

None of the three has door codes or Wi-Fi stored, so the check-in details in step 6 show the street address and
"call Live Luxe for access", never a real code.

## Before you start (do these the day before)

1. **Deploy the latest code to the test site.** Push `main`, then `node scripts/deploy-hobby.mjs`. Open
   `/api/health`: `version` must be the latest commit. (The picker that refuses booked dates, step 2, is in it.)
2. **Database updates.** In Supabase (test project) → SQL Editor, run
   `supabase/migrations/20261016120000_tenant_hardening.sql`. It is the one update not applied yet; without it the
   test site cannot submit requests. If it errors, keep the message.
3. **Optional, start numbering at 000001.** The old requests are gone, so this is safe. In the same SQL Editor:
   `select setval('booking_reference_seq', 1, false);` Without it the first demo request is **LLX-2026-000017**.
4. **Stripe webhook.** Stripe dashboard, **Test mode** → Developers → Webhooks: there must be an endpoint for
   `https://liveluxe-partner-portal.vercel.app/api/webhooks/stripe`, and its signing secret must be the
   `STRIPE_WEBHOOK_SECRET` in Vercel. Without it, card holds can be slow to register and approvals can stall.
5. **Your admin password and two-factor.** Window A: open the site → **Forgotten your password?** → enter
   claudia@liveluxeau.com → the email comes from Supabase (check Spam) → set a new password → sign in from the
   **login page**. Staff land on the ops console (**/admin/queue**: navy header, "Live Luxe · Operations", Queue /
   Bookings / Settings); it should be empty. If you land on the cream partner side instead (staff can open both),
   go to `/admin/queue`. Two-factor is optional for staff: turn it on now so the demo shows it. **Settings** →
   **Two-factor authentication** → **Turn on** → scan the QR code with an authenticator app (Google Authenticator,
   1Password, Microsoft Authenticator) → enter the 6-digit code. From then on every sign-in asks for the code.
6. **The invite reached the partner admin.** johnearlmandawe17@gmail.com has an email from
   **bookings@booking.liveluxe.au**, subject "You're invited to the Livluxe partner portal — Demo Insurance Co"
   (check Spam). The link works for 7 days. Do not open it yet.
7. Have the **test cards** to hand: `4242 4242 4242 4242` (works), `4000 0027 6000 3184` (asks for 3D Secure),
   any future expiry, any CVC, any postcode.

If someone types a wrong password several times, sign-in locks for 15 minutes. Wait it out rather than retrying.

---

## 1. The partner admin joins and invites the team

**Window B, partner admin (johnearlmandawe17@gmail.com)**

1. Open the invite email → **Accept invitation**. The page names Demo Insurance Co and the role (Administrator).
2. Set a password (at least 12 characters; known-breached passwords are refused) → you land on the **Dashboard**:
   "Good morning", the organisation name, nothing waiting, an empty Requests list.
3. **Team** → **Invite someone** → your personal email 1, role **Booker** → **Send invitation**.
4. **Invite someone** again → your personal email 2, role **Finance** → **Send invitation**. Both show as
   "Invited · expires in 7 d".
5. Point out: an address outside gmail.com / liveluxeau.com is refused (try one): the organisation controls who can
   join.

**Each personal inbox:** the same invite email → **Accept invitation** → set a password. Email 1 continues in
window B (sign out of the admin first); email 2 in window C.

| Email                                                            | To           | From                         |
| ---------------------------------------------------------------- | ------------ | ---------------------------- |
| You're invited to the Livluxe partner portal — Demo Insurance Co | each invitee | bookings@booking.liveluxe.au |

## 2. The booker finds a property and sends a request

**Window B, Booker (personal email 1)**

1. **Search** → type **Docklands** → **Search**. Point out: real photos, bedrooms, guests, prices, and the
   availability line at the top (amber if the calendar sync is old).
2. Open **628 Flinders Street** (2 bed; or use the link above).
3. **Show that booked dates cannot be chosen.** In **Price a stay** → **Dates**:
   - go to October: **22 and 23 Oct are struck through**; hover one, it says **"Booked"**; clicking does nothing;
   - pick **Sat 24 Oct** as check-in, then hover **Thu 26 Nov**: the line under the calendar says **"The stay would
     cross a booked night (Mon 23 Nov)"**;
   - hover **Mon 23 Nov**: it says **"30 nights · Sat 24 Oct → Mon 23 Nov"** (leaving on a booked day is fine:
     the next guest arrives after you leave). Click it.
4. The price appears on its own: 30 nights, accommodation, the length-of-stay discount, cleaning, GST, the total,
   and "Your card is held when you send the request and charged only if Live Luxe approves". The 90-day calendar
   below marks the same dates in gold. Point out: the price already carries Demo Insurance Co's own 10% partner
   rate (its rate card), so every booker in the organisation sees the negotiated price.
5. **Request this property** → fill in the guest (any name, email, phone) and **Claim reference** `CLM-DEMO-001`
   (required: try sending without it) → **Send request and authorise card**.

| Email                    | To     | From                         |
| ------------------------ | ------ | ---------------------------- |
| Request received — LLX-… | Booker | bookings@booking.liveluxe.au |

## 3. The booker authorises the card

**Window B, Booker**

1. The card step opens (Stripe's own form, inside the portal). Card `4242 4242 4242 4242`, any future date, any CVC
   → **Pay now**. Point out: nothing is charged yet; the card is only held.
2. Optional, 3D Secure: use `4000 0027 6000 3184` instead; Stripe shows its test challenge → **Complete**.
3. Back on the request: status **Submitted**, next step "Reply by …" (Live Luxe's deadline). The **Dashboard**
   shows it under Requests in progress.

## 4. Live Luxe approves; the booking confirms

**Window A, Live Luxe admin**

1. **Queue**: the request is there with its deadline clock, partner, property, dates, guests and total.
2. Open it → point out the claim reference, the card hold ("Card held"), the price breakdown.
3. **Approve** → **Approve and confirm**. What the portal does, in order (each appears on the request's timeline):
   1. re-checks live availability for exactly these nights;
   2. creates the booking (on this test site the Hostaway reservation step is **skipped**: writes are off here by
      design, so no real reservation is made; in production it is written to Hostaway at this point);
   3. **captures the card** in Stripe (test mode);
   4. issues the **tax invoice** (Stripe);
   5. emails the partner.
4. The status becomes **Confirmed**. In Stripe (test mode) → Payments: the payment is **Succeeded**.

**Window B, Booker**: the request shows **Confirmed**, with "Check-in details on …" (48 hours before check-in).

| Email             | To     | From                         |
| ----------------- | ------ | ---------------------------- |
| Approved — LLX-…  | Booker | bookings@booking.liveluxe.au |
| Confirmed — LLX-… | Booker | bookings@booking.liveluxe.au |

If it says **"Confirming your booking"** for more than a minute, refresh. If it stays there, see Troubleshooting.

## 5. Finance downloads the tax invoice

**Window C, Finance (personal email 2)**

1. **Invoices**: the invoice for the booking, with the amount, status (Paid) and the request reference.
2. Open it → download the PDF. Point out: ABN, the claim reference and the line items are printed on it, so it can
   go straight into the claim file. Finance cannot send booking requests (their role sees prices and invoices).

## 6. Live Luxe releases the check-in details early

**Window A, Live Luxe admin**

1. Open the confirmed booking → **Check-in** panel → **Release access pack now** → confirm.
2. Point out the access log: every partner view of the details is recorded with time and device.

**Window B, Booker**: the request now shows the **street address** and the check-in panel. For these demo
apartments no door code or Wi-Fi is stored, so it says to call Live Luxe for access (in production it shows the
code, Wi-Fi and directions, and hides them again after check-out).

| Email                          | To     | From                         |
| ------------------------------ | ------ | ---------------------------- |
| Check-in details ready — LLX-… | Booker | bookings@booking.liveluxe.au |

## 7. Second request: a counter-offer

**Window B, Booker**

1. Open **673 La Trobe Street** (1 bed) → dates **Tue 10 Nov → Tue 24 Nov** (14 nights) → claim `CLM-DEMO-002` →
   send → authorise the card (`4242 …`).

**Window A, Live Luxe admin**

2. Queue → open it → **Counter-offer** → change the check-out to **Sat 21 Nov** (a shorter stay; a lower total
   stays within the card hold) → add a note, e.g. "We can do 11 nights; the apartment is booked from the 21st" →
   **Send counter-offer**. The deadline clock pauses while the partner decides.

**Window B, Booker**

3. The request shows Live Luxe's proposal and the new total → **Accept counter-offer** → confirm. It goes back to
   Live Luxe with the clock running again.

**Window A**: **Approve** → **Approve and confirm**, as in step 4.

| Email                                  | To     | From                         |
| -------------------------------------- | ------ | ---------------------------- |
| Request received — LLX-…               | Booker | bookings@booking.liveluxe.au |
| Proposal for your request — LLX-…      | Booker | bookings@booking.liveluxe.au |
| Approved — LLX-… and Confirmed — LLX-… | Booker | bookings@booking.liveluxe.au |

## 8. Third request: a decline

**Window B, Booker**

1. Open **677 La Trobe Street** (2 bed) → dates **Sun 1 Nov → Sun 8 Nov** → claim `CLM-DEMO-003` → send →
   authorise the card.

**Window A, Live Luxe admin**

2. Queue → open it → **Decline** → reason **Maintenance required** → note, e.g. "Lift works on this floor in
   November; 673 La Trobe Street is free on your dates" → confirm. The card hold is released straight away.

**Window B, Booker**

3. The request shows **Declined**, Live Luxe's reason and note, and what to do next: **See what else is free for
   these dates** (a search on the same dates) and **Ask Live Luxe to find one**.

| Email                          | To     | From                         |
| ------------------------------ | ------ | ---------------------------- |
| Request received — LLX-…       | Booker | bookings@booking.liveluxe.au |
| Update on your request — LLX-… | Booker | bookings@booking.liveluxe.au |

Stripe's own receipts: in test mode Stripe does not email customers, so the only emails are the portal's.

---

## Afterwards: reset for the next demo

From the repo, on a machine whose `.env.local` points at the **test** environment (the scripts refuse anything else):

```bash
node scripts/demo-reset.mjs                 # dry run: shows what would be removed
node scripts/demo-reset.mjs --yes           # removes the demo organisation, its people, requests, payments,
                                            # invoices and its Stripe test objects
node scripts/demo-setup.mjs --admin-email johnearlmandawe17@gmail.com \
  --ops-email claudia@liveluxeau.com --domains gmail.com,liveluxeau.com
                                            # recreates Demo Insurance Co, the 10% rate card, and sends a fresh invite
```

`demo-reset` prints the next request number and, when no requests remain, the one SQL line that restarts numbering.
It never touches listings, calendars, other partners or the Live Luxe staff accounts. A staff test request on Live
Luxe's own organisation can be removed by naming it: `--include-request LLX-2026-000123`.

## Troubleshooting

- **"Confirming your booking" stays for minutes.** The card capture or the confirmation step did not finish. Refresh
  the request page (it re-checks Stripe). On the Hobby plan the retry job runs once a night, so if it is still stuck,
  check the Stripe webhook (Before you start, 4) and the Vercel logs for `booking.confirm`.
- **"Too many sign-in attempts".** Wait 15 minutes.
- **Invite refused: "domain not allowed".** Use a @gmail.com or @liveluxeau.com address, or add the domain on
  Admin → Partners → Demo Insurance Co.
- **A date you expected to be free is struck through.** Hostaway changed since this page was written. Run
  `node scripts/demo-setup.mjs` again only after a reset; or pick the next free range the calendar shows.
- **Submitting a request fails** with a server error: the tenant-hardening database update (Before you start, 2) is
  not applied.
