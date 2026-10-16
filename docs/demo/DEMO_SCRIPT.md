# Partner portal demo: the whole flow, live, on the test site

You create the partner and its people in front of the audience. About 40 minutes. Rehearsed end to end on
17 Oct 2026 (a dry run on the test database; what it found is at the end of this page).

Everything happens on the **test environment**: the test site, its test database, Stripe in test mode (no real
money) and Hostaway writes switched off. Site: **https://liveluxe-partner-portal.vercel.app**

## Windows and accounts

| Window                                 | Who                   | Email                                                                    | Role                              |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| **A**, your normal browser             | Live Luxe ops         | claudia@liveluxeau.com                                                   | Live Luxe administrator           |
| **B**, a private / incognito window    | Partner administrator | personal email 1                                                         | Demo Insurance Co · Administrator |
| **B** (sign out, then sign in as next) | Booker                | personal email 2                                                         | Demo Insurance Co · Booker        |
| **B** (sign out, then sign in as next) | Finance               | personal email 1 with `+finance` before the @ (`name+finance@gmail.com`) | Demo Insurance Co · Finance       |

Gmail delivers `name+finance@gmail.com` to the same inbox as `name@gmail.com`, and the portal treats it as a separate
person (checked in the dry run). Open every invite link in window B.

## The three properties

Open them by link: a Docklands search shows several cards with the same street name (see Known rough edges).

| Use                           | Partners see                               | Free on 17 Oct (live Hostaway and the portal agree)                                                                | Link                                                                                                            |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Request 1: approve, 30 nights | **628 Flinders Street** · 2 bed · sleeps 4 | 30 Oct → 23 Nov; **26 Nov → 31 Dec**. Use **26 Nov → 26 Dec**; 23–25 Nov are booked, which shows the refused dates | [/listings/18efae07…](https://liveluxe-partner-portal.vercel.app/listings/18efae07-2b20-44f1-ad1c-b2801baf0c48) |
| Request 2: counter-offer      | **673 La Trobe Street** · 1 bed · sleeps 2 | 19 Oct → 10 Dec. Use **25 Nov → 5 Dec**                                                                            | [/listings/f065ecd5…](https://liveluxe-partner-portal.vercel.app/listings/f065ecd5-5d52-42b8-983c-fac617d6eb39) |
| Request 3: decline            | **677 La Trobe Street** · 2 bed · sleeps 4 | 25 Oct → 18 Nov; 29 Nov → 31 Dec. Use **1 Nov → 8 Nov**                                                            | [/listings/563b7155…](https://liveluxe-partner-portal.vercel.app/listings/563b7155-0b60-4352-9c0b-377148d915ce) |

Hostaway changes: 628 Flinders Street gained a booking (24–29 Oct) between 16 and 17 Oct. Refresh the calendar
before the demo (Before you start, 2) and look at the property page before you pick the dates.

## Before you start

1. **Deploy the latest `main`** (`node scripts/deploy-hobby.mjs`; `/api/health` shows the commit). It carries the
   dry-run fixes: the New partner form now saves the credit limit and payment terms, and the card page, emails and
   tax invoice name the property by its street, as the property page does.
2. **Refresh availability within the hour before the demo.** From the repo, with `.env.local` on the test project:
   `node scripts/run-job.mjs sync-calendar-near`, repeated until it says "pass complete". The test site cannot do this
   every 15 minutes on the Hobby plan. Without it:
   - every page shows "Availability last confirmed … — may be out of date" in amber;
   - approval (step 9) re-checks Hostaway live and **refuses** if Hostaway has taken the dates since. It happened in
     the dry run: "These dates are no longer available for this property. Hostaway shows 24 Oct – 29 Oct taken
     (5 nights). Nothing was charged."
3. **Reset:** `node scripts/demo-reset.mjs --yes` (see Reset). The queue and Bookings are then empty and no partner
   organisation exists.
4. Optional, references from 000001. Supabase (test project) → SQL Editor:
   `select setval('booking_reference_seq', 1, false);` Without it the first request is **LLX-2026-000022**.
5. Optional, the decision deadline. The test settings still hold the default (4 business hours, Mon–Fri, 8 am–6 pm),
   so on a weekend the partner reads "We'll reply by Mon …, 12:00 pm". David's answer (24 hours, 24/7) is not in the
   settings yet.
6. Stripe (test mode) → Developers → Webhooks has an endpoint for
   `https://liveluxe-partner-portal.vercel.app/api/webhooks/stripe`.
7. Window A signed in as claudia@liveluxeau.com **from the login page**, so you land on **/admin/queue**. Window B
   open, private, on the login page. The inboxes for personal emails 1 and 2 open in tabs.

If a password is mistyped several times, sign-in locks for 15 minutes. Wait it out.

---

## 1. The empty queue

**Window A · claudia@ (Live Luxe admin)**

- **Queue** (navy header, "Live Luxe · Operations") says **"Nothing waiting on Live Luxe"**.
- Audience: this is Live Luxe's side. Every partner request lands here with its decision clock.

## 2. Create the partner

**Window A · claudia@**

1. **Partners** → **New partner** (top right; the same button sits in the empty list).
2. Fill in:
   - **Organisation name** `Demo Insurance Co` · **Type** Insurance
   - **Payment terms** **Card: hold at request, charge on approval**
   - **Credit limit (AUD, invoice terms)** `5000`. It governs invoice terms; card bookings are covered by the hold.
   - **Email domains (comma separated)** `gmail.com`
   - tick **Claim reference is mandatory on requests**; leave **PO number is mandatory on requests** unticked
   - leave **Decision SLA (business hours)** empty: the platform default applies.
3. Save. The partner page opens: **Active · Card · Claim reference required**; Payment "Card: hold at request, charge
   on approval"; Email domains gmail.com.

Audience: the email domains are a guard rail. Inviting someone outside them shows a warning (it does not block).

## 3. Publish the rate card

**Window A · claudia@**

1. **Rate cards** → **Demo Insurance Co** → **Publish a new version**.
2. **Card name** `Demo Insurance Co partner rate` · **Discount on the nightly rate (%)** `10`.
3. **Takes effect** opens on **tomorrow**: click it and choose **today** (an extra click; the form defaults to the
   next day).
4. **Review and publish** → confirm. The partner page shows the chip **"Demo Insurance Co partner rate · 10% off"**.

Audience: every booker in the organisation now sees the negotiated price; quotes already issued keep theirs.

## 4. Invite the partner administrator

**Window A · claudia@**

1. The partner page → **People** → **Invite someone**.
2. **Email address** personal email 1. **Role**: the cards preselect **Booker**, so click **Administrator** ("Books,
   pays and manages who has access").
3. **Send invitation** → "Invitation sent." The person shows as invited, expiring in 7 days.

| Email                                                            | To               | From                         |
| ---------------------------------------------------------------- | ---------------- | ---------------------------- |
| You're invited to the Livluxe partner portal — Demo Insurance Co | personal email 1 | bookings@booking.liveluxe.au |

## 5. The partner admin joins

**Window B · personal email 1**

1. The invite email → the link → **"Join Demo Insurance Co"**, "You have been invited as **Administrator**".
2. **Your name**, **New password** (at least 12 characters, checked against known breaches), **Confirm password** →
   **Activate account**. The card says "Step 1 of 2"; partners then go straight to the dashboard.
3. The **Dashboard**: "Good morning, …", a welcome panel (Search → Request → We confirm), and empty Requests, This week
   and Recent activity.

## 6. The team

**Window B · personal email 1**

1. **Team** → **Invite someone** → personal email 2 → **Booker** → **Send invitation**.
2. **Invite someone** → `name+finance@gmail.com` → **Finance** → **Send invitation**. Both show as invited.
3. Sign out (account menu, top right). Open each invite email in window B in turn → **Activate account** → sign out.

Audience: the partner manages its own people; Live Luxe does not have to.

| Email                                                            | To                                   | From                         |
| ---------------------------------------------------------------- | ------------------------------------ | ---------------------------- |
| You're invited to the Livluxe partner portal — Demo Insurance Co | personal email 2, and the `+finance` | bookings@booking.liveluxe.au |

## 7. The booker finds a property and prices 30 nights

**Window B · personal email 2 (Booker)**

1. **Search** → **Docklands** → **Search**: photos, bedrooms, guests. Open **628 Flinders Street** (link above).
2. **Price a stay** → **Dates** (the calendar opens above the field):
   - go to November: **23, 24 and 25 Nov are struck through**; hover one: **"Booked"**; clicking does nothing;
   - to show a stay that would cross them: click **19 Nov**, hover **27 Nov**: "The stay would cross a booked night
     (Mon 23 Nov)". Click **19 Nov** again to start over;
   - click **Thu 26 Nov**, hover **Sat 26 Dec**: **"30 nights · Thu 26 Nov → Sat 26 Dec"**, then click it.
3. The price appears on its own. Point at **"Partner rate card (10%) −AUD …"** next to the length-of-stay discount,
   cleaning and GST. In the dry run: AUD $9,030.75 for 30 nights, after −$894.77 partner discount.
4. The 90-day calendar below marks the same dates in gold.

## 8. The booker sends it and authorises the card

**Window B · Booker**

1. **Request this property** → **Guest name**, **Guest email**, **Guest phone**, **Claim reference** `CLM-DEMO-001`
   (required: try **Continue to review** without it) → **Continue to review**.
2. Tick the terms → **Send request and authorise card**. The top says "Request LLX-… is sent. One more step so Live
   Luxe can decide."
3. **Authorise your card**: card `4242 4242 4242 4242`, any future expiry, any CVC → **Place card hold**. Stripe's
   form may offer **Link** and guesses the country from your network (Philippines in the dry run): ignore both.
4. Optional 3D Secure: card `4000 0027 6000 3184`; Stripe shows its test challenge → **Complete**. (Not run in the dry
   run.)
5. The request page: **Submitted · Card hold · Claim CLM-DEMO-001**, "Live Luxe is reviewing your request … nothing is
   charged unless we approve", the quote, and **Visa ••4242 · Card held (not charged)**.

| Email                    | To     | From                         |
| ------------------------ | ------ | ---------------------------- |
| Request received — LLX-… | Booker | bookings@booking.liveluxe.au |

## 9. Live Luxe approves

**Window A · claudia@**

1. **Queue** (the count shows 1) → the request. Staff see the unit: **713/628 Flinders Street**.
2. **Approve**. The dialog lists what will happen: **re-check availability and create the reservation in Hostaway**,
   **charge AUD … to the card on hold**, **confirm the booking**, **the booker is emailed** → **Approve and confirm**.
3. The timeline then reads Submitted → Under review → Approved → Confirmed. In order, the portal:
   1. re-checks Hostaway live for exactly these nights (and refuses if they were taken; Before you start, 2);
   2. creates the reservation in Hostaway: **skipped on the test site**, where writes are off by design;
   3. captures the card in Stripe (test mode);
   4. issues the tax invoice in Stripe, marked paid;
   5. emails the booker.

## 10. The booker sees it confirmed

**Window B · Booker**

- The request: **Confirmed**, steps ticked to Confirmed, "You'll get the door code and Wi-Fi Tue 24 Nov, 3:00 pm AEDT,
  by email and on this page", Payment **Paid**, and the tax invoice with **View** and **PDF**.
- The inbox: **Confirmed — LLX-…**. There is no separate "Approved" email when the booking confirms at once.

## 11. Finance downloads the tax invoice

**Window B · sign out, sign in as `name+finance@gmail.com` (Finance)**

1. The menu has **Invoices** and no Team; Finance cannot book.
2. **Invoices**: "Paid this month AUD …", the invoice with the booking reference → **View invoice … (opens in a new
   tab)** → Stripe's invoice page → download the PDF. (The request page also has **PDF** beside the invoice.)
3. On the invoice: **Claim ref CLM-DEMO-001**, **Booking LLX-…**, **Stay 628 Flinders Street, dates**.

## 12. Live Luxe releases the check-in details early

**Window A · claudia@**

1. Open the booking → **Release check-in pack now** → confirm.

**Window B · sign in as the Booker**

2. The request: **"Confirmed — check-in details are ready"**, the step "Check-in details sent" ticked, and **Check-in
   details**: the street address with the unit, check-in and check-out times. These demo apartments have no door code
   stored, so the panel says "The door code isn't stored here yet. Email contact@liveluxeau.com…". In production it
   shows the code and Wi-Fi, and every view is logged.

| Email                          | To     | From                         |
| ------------------------------ | ------ | ---------------------------- |
| Check-in details ready — LLX-… | Booker | bookings@booking.liveluxe.au |

## 13. A counter-offer, then a decline

**Counter-offer**

1. **Window B · Booker**: **673 La Trobe Street** → **25 Nov → 5 Dec** (10 nights) → claim `CLM-DEMO-002` → send →
   card `4242 …` → **Place card hold**.
2. **Window A**: Queue → the request → **Counter-offer**. It says "Now: … · AUD …. Change either or both."
   - **Dates** → **25 Nov** → **3 Dec** (8 nights).
   - **New total**: leave empty (the grey number is only the current total). Empty prices the new dates at the
     partner's rates: in the dry run AUD $2,982 for 10 nights became AUD $2,255 for 8.
   - **Message to the partner** (required): "We can do 8 nights; the apartment is booked from the 3rd."
   - **Send counter-offer**. The request shows "Waiting on partner"; the clock pauses.
3. **Window B · Booker**: "Live Luxe suggested a change. Please accept or decline by …" → **Accept counter-offer** →
   "You accepted the counter-offer. Live Luxe will confirm shortly."
4. **Window A**: **Approve** → **Approve and confirm**. Only the new, lower total is charged.

| Email                             | To     | From                         |
| --------------------------------- | ------ | ---------------------------- |
| Request received — LLX-…          | Booker | bookings@booking.liveluxe.au |
| Proposal for your request — LLX-… | Booker | bookings@booking.liveluxe.au |
| Confirmed — LLX-…                 | Booker | bookings@booking.liveluxe.au |

**Decline**

1. **Window B · Booker**: **677 La Trobe Street** → **1 Nov → 8 Nov** → claim `CLM-DEMO-003` → send → card.
2. **Window A**: the request → **Decline** → reason **Maintenance required** (others: No longer available, Property
   not suitable for this stay, Owner has blocked these dates, Commercial terms, Guest profile, Other) → note "Lift
   works on this floor in November; 673 La Trobe Street is free on your dates" → confirm. The card hold is released
   at once.
3. **Window B · Booker**: **Declined** · "Live Luxe couldn't take this request" · the reason and the note · "The dates
   have been released and nothing was charged. You can search again with the same dates."

| Email                          | To     | From                         |
| ------------------------------ | ------ | ---------------------------- |
| Request received — LLX-…       | Booker | bookings@booking.liveluxe.au |
| Update on your request — LLX-… | Booker | bookings@booking.liveluxe.au |

---

## Reset

From the repo, with `.env.local` on the **test** project. The script refuses a production environment, a live Stripe
key, Hostaway writes switched on, or any Supabase project but the test one.

```bash
node scripts/demo-reset.mjs          # dry run: lists what would be removed
node scripts/demo-reset.mjs --yes    # removes it
```

It removes "Demo Insurance Co" and the throwaway "iinsurance de": their people and sign-in accounts, requests,
quotes, holds, payments, invoices, refunds, rate cards, comments, notifications, invitations, the audit rows about
them, and their Stripe test objects (holds cancelled, open invoices voided, the customer deleted). Live Luxe staff,
listings, calendars and other partners are never touched. It prints the next request number and the SQL line to
restart it.

## What is simulated in test mode

- **The Hostaway reservation.** Approval re-checks Hostaway live (real) but does not create the reservation: writes are
  off on the test site. Nothing appears in Hostaway, Airbnb or Booking.com.
- **The money.** Stripe test mode: test cards, no real charge. Stripe sends no receipts in test mode; the only emails
  are the portal's.
- **Door codes and Wi-Fi.** None stored for these apartments; the panel shows the "email Live Luxe" fallback.
- **Timing.** On the Hobby plan the background jobs (hold expiry, deadline alerts, check-in release 48 hours ahead,
  retries) run once a night, so the demo releases details by hand.
- **Availability freshness.** The calendar refreshes only when the sync runs (Before you start, 2).

## What the dry run found (17 Oct 2026)

Fixed in code (deploy before the demo):

- **New partner discarded the payment terms, credit limit, deposit % and finance contact.** Only editing saved them,
  so the AUD 5,000 limit would have vanished.
- **The card page, the request-received, decision, confirmed, check-in and payment emails, and the tax invoice used
  the Airbnb title** ("The Urban Treehouse Oasis w Pool, Spa, Sauna & Gym") while the property page said
  "628 Flinders Street".
- **Ops screens used the Airbnb title too.** They now show the street with the unit ("713/628 Flinders Street").
- The counter-offer hint said "Leave empty to keep the current total"; empty actually prices the new dates.
- A decline note ending in a full stop printed two ("dates..").

Known rough edges (unchanged; worth knowing on stage):

- **The Docklands search shows look-alike cards.** Several apartments in one building share a street name, and the
  multi-unit Hostaway groupings repeat single apartments with the same photo. David's list says those groupings should
  not be partner-visible; hiding them is a go-live task.
- The rate card's **Takes effect** defaults to tomorrow; the invite's **Role** defaults to Booker.
- The accept page says "Step 1 of 2", but partners have no step 2.
- A paid booking still shows the **"Card hold"** chip (it names the payment terms, not the state).
- The released-details banner says "The door code and Wi-Fi are below" even when none is stored.
- Stripe's card form shows **Link** and guesses the country from the network.
