# Yala Wild Safaris: Build Spec for Claude Code

This folder is a **clickable HTML prototype** plus this spec. Build the real app from it.
The prototype pages are the source of truth for **layout, wording and flow**. This file is the source of truth for **data, rules and back-end behaviour**.

> "Yala Wild Safaris", all prices, times, policies and contact details are **placeholders**. Keep them in the `Setting` table so the owner can change them in Admin → Settings.

---

## 1. What we're building

A booking platform for **one safari company** (not a marketplace, so there is no platform commission and no vendor subscription fees).

| Area | Who | Prototype files |
|---|---|---|
| Public website | Tourists | `customer/*.html` |
| Shared-trip link page | Tourists who got a link | `shared/trip.html` |
| E-ticket | Tourists | `customer/ticket.html` |
| Emails | Everyone | `emails/index.html` (16 templates) |
| Admin panel | Owner + staff | `admin/*.html` |
| Partner registration | Jeep drivers, trackers, meal suppliers | `vendor/register.html` |
| Partner portal | Approved partners | `vendor/portal.html` |

### Key product decisions
1. **The public site sells private safaris only.** There is no shared option anywhere on the public site.
2. **Shared safaris are link-only.** Admin creates a shared trip, and the app makes a private link (`/s/{tripId}`). Staff send it by WhatsApp or email to people who ask.
3. **Three sessions:** Morning, Evening, Full day. Times and prices come from settings.
4. **Guest checkout:** customers have no accounts. They find a booking with booking code + phone.
5. **Emails:** the company gets an email for every new booking. The customer gets a QR e-ticket by email when the booking is **confirmed**.
6. **Partners (vendors)** apply through a public form. Admin approves them, assigns them to trips, and they accept jobs and check guests in.
7. **Every notification is an email.** There is no SMS and no WhatsApp from the system. Phone numbers are stored only so the driver can call a guest on the day. Partners log in with **email + password or an emailed login link**.
8. **Scanning the e-ticket QR starts the trip.** The first scan, by the driver in the partner portal or by staff in Admin → Check-in, does three things:
   - sets the booking to STARTED;
   - emails the guest "your safari has started" (and optionally the office);
   - shows the trip as live on the admin dashboard and creates the partner payout lines.
9. **Payments & profit.** Admin sees the money for each trip: revenue − partner costs (jeep, tracker, meals, camera) = profit, with totals by period. Admin also pays partners. Each partner sees what they're owed and what they've been paid.
10. **Meal choice per guest.** A group of 6 can pick 6 different meals, and anyone can choose "No meal". Price = number of meals × meal price.
11. **The e-ticket is a link.** The confirmation email's main button opens `/t/{code}`, which shows the QR. The email also has a small QR as a backup.
12. **Everything must work well on a phone** (360px wide and up). Drivers use the partner portal on their phone.

---

## 2. Suggested tech stack

- **Next.js (App Router) + TypeScript**: one app with route groups `(site)`, `(admin)`, `(partner)`.
- **PostgreSQL + Prisma.**
- **Tailwind CSS**: copy the colour tokens from `:root` in any prototype page (light + dark).
- **Auth:**
  - Admin/staff: email + password (bcrypt), httpOnly session cookie, roles `OWNER` | `STAFF`.
  - Partners: email + password, or an emailed magic link. **No SMS.**
  - Seed the first owner with a script. **Do not** add a public "setup admin" endpoint.
- **Email:** React Email templates + Resend (or SMTP via Nodemailer). The templates are in `emails/index.html`.
- **QR codes:** `qrcode` npm package. Make a PNG for emails (inline CID attachment) and an SVG on the web.
- **Payments:** put this behind a `PaymentProvider` interface (`createCheckout`, `verifyWebhook`, `refund`).
  - First check which gateways can actually pay out to a **Sri Lankan business**. Stripe may not support Sri Lanka-registered businesses. PayHere is a common local option.
  - Build a `MockProvider` first so everything works end to end.
- **Scheduled jobs:** a cron route (e.g. Railway cron hitting `/api/cron/*` with a secret header) or `node-cron`.
- **Maps:** Google Maps JS API for the pickup pin, plus a server-side distance check.

---

## 3. Data model (Prisma-style)

```
Setting        key String @id, value Json            // all business settings (see §7)
Session        id (morning|evening|full), name, startTime, endTime, pickupTime,
               privateJeepPrice Int, sharedSeatPrice Int, active Bool
Extra          id, name, price Int, per (PERSON|BOOKING), active Bool
ClosedDate     date @id, reason

Booking        id, code @unique (e.g. YWS-4821K), type PRIVATE,
               sessionId, date, guests Int, children Int, jeeps Int,
               pickupMode (HOTEL|OFFICE), hotelName, pickupLat, pickupLng, pickupKm,
               leadName, phoneCc, phone, email, notes,
               payOption (DEPOSIT|FULL|AT_PICKUP),
               total Int, paid Int, status (REQUEST|CONFIRMED|COMPLETED|CANCELLED|DECLINED),
               status also has STARTED (between CONFIRMED and COMPLETED),
               ticketSentAt, startedAt, startedBy (partnerId|adminId), completedAt, allergyNote,
               createdBy (WEB|ADMIN), createdAt
BookingMeal    bookingId, guestNo 1..n, preference (NON_VEG|VEGETARIAN|VEGAN|NO_BEEF|NO_PORK|HALAL|KIDS|NONE)
BookingExtra   bookingId, extraId, qty, price
Assignment     id, bookingId?, sharedTripId?, partnerId, role (JEEP|GUIDE|MEALS),
               fee Int, status (OFFERED|ACCEPTED|DECLINED), respondedAt

SharedTrip     id @unique (e.g. SH-7Q2K, used in the link), sessionId, date,
               seatPrice Int, seats Int (6), minSeats Int (4),
               status (OPEN|LINKS_SENT|CONFIRMED|FULL|COMPLETED|CANCELLED),
               autoCancelAt DateTime, createdAt
SharedSeat     id, tripId, seatNo 1..6, code @unique (YWS-Sxxxx),
               name, phoneCc, phone, email, hotelName, meals Bool,
               payOption (NOW|LATER), amount Int, meal (preference or NONE),
               status (RESERVED|PAYMENT_PENDING|PAID|RELEASED|REFUNDED|CANCELLED),
               payDeadline DateTime?, checkedInAt
               @@unique([tripId, seatNo]) for active seats (enforce in a transaction)

Payment        id, bookingId?, seatId?, provider, providerRef, amount, kind (DEPOSIT|FULL|BALANCE|REFUND),
               method (CARD|CASH|BANK), status, createdAt   // also used for cash recorded by admin

Partner        id, type (JEEP_DRIVER|GUIDE|MEAL_SUPPLIER), name, nic, phone, email, area,
               languages String[], vehiclePlate, vehicleModel, vehicleYear, seats,
               licenceNo, yearsExperience, bankName, branch, accountName, accountNo,
               defaultFee Int, rating Float, status (APPLIED|ACTIVE|PAUSED|REJECTED),
               rejectReason, approvedAt
PartnerDocument partnerId, kind, fileUrl, uploadedAt              // private storage only
PartnerDayOff  partnerId, date
PayoutLine     id, partnerId, bookingId?, sharedTripId?, role (JEEP|GUIDE|MEALS|CAMERA), amount Int,
               status (UNPAID|PAID), payoutId?, createdAt      // created when the trip STARTS
Payout         id, partnerId, reference, method (BANK|CASH|CHEQUE), amount Int, paidAt, createdBy

AdminUser      id, name, email @unique, passwordHash, role (OWNER|STAFF)
EmailLog       id, template, to, subject, entity, entityId, status, error, sentAt
ActivityLog    id, entity, entityId, message, actor, createdAt     // drawer "Activity" list
```

Store money as **integer LKR**.

---

## 4. Rules

### 4.1 Private availability
- `jeepsNeeded = ceil(guests / maxPerJeep)` (maxPerJeep default 6).
- `jeepsFree(date, session) = fleetSize − jeeps used by CONFIRMED/REQUEST private bookings − active shared trips`, for that date and session.
- **A full-day booking uses its jeep in both the morning and evening slots.**
- These days can't be booked: closed dates, dates before `today + minLeadTime`, and dates after the max-ahead window.
- Check availability again **inside the transaction** that creates the booking.

### 4.2 Price
`total = jeeps × session.privateJeepPrice + Σ extras`. Per-person extras are multiplied by `guests`.
**Always compute this on the server.** Never trust an amount sent by the browser.

### 4.3 Private status flow
```
                 ┌──────────── pay DEPOSIT or FULL online (webhook OK) ───────────┐
create (web) ────┤                                                                ▼
                 └── AT_PICKUP ──► REQUEST ──(admin Confirm)──► CONFIRMED ──(QR scan)──► STARTED ──(trip finished)──► COMPLETED
                                     │                              │
                                     └──(admin Decline)──► DECLINED └──(guest/admin cancel)──► CANCELLED (+refund per policy)
```
- A booking becomes CONFIRMED in two ways: the payment webhook succeeds, **or** an admin taps Confirm.
- On CONFIRMED, send `cust_confirmed` (e-ticket) and set `ticketSentAt`.
- A booking made by an admin (phone booking) can be created straight as CONFIRMED.

### 4.4 Shared trip rules
- Admin creates a trip with date, session, seat price (defaults to the session's shared price), and an optional jeep.
- Link: `https://{domain}/s/{tripId}`. If the trip doesn't exist or is cancelled, show "This link isn't valid".
- Booking a seat:
  - **Pay now** → seat PAID after the webhook.
  - **Reserve, pay later** → seat RESERVED.
- When **held seats (RESERVED + PAYMENT_PENDING + PAID) ≥ minSeats**:
  - Every RESERVED seat becomes PAYMENT_PENDING with `payDeadline = now + payWindow` (24h).
  - Send `cust_shared_pay`. Trip status becomes LINKS_SENT.
- When **PAID ≥ minSeats**: trip CONFIRMED. Send `cust_shared_ticket` (QR) to every paid seat, and to each seat paid later.
- 6 held seats → FULL (the link page shows "full").
- Cron, every 5 min: PAYMENT_PENDING seats past their deadline become RELEASED (seat freed, guest emailed).
- Cron, hourly: trips with fewer than minSeats PAID at `autoCancelAt` (24h before start) are CANCELLED.
  - Refund every PAID seat and send `cust_shared_cancel`, which offers a private upgrade.
- Use a DB transaction with a row lock when taking a seat, so two people can't get the same seat.

### 4.5 Cancellation policy (in settings)
Default: more than 48h before → 100%, 24–48h → 50%, under 24h → 0%. Hours are measured to the session **start time**.
Admin can override the refund amount.

### 4.6 E-ticket and QR
- The QR encodes `https://{domain}/t/{code}?k={sig}`, where `sig = HMAC-SHA256(code, TICKET_SECRET)` truncated.
- `/t/{code}` shows the ticket page if the signature is valid. For staff who are logged in, it also offers **Check in**.
- Check-in (Admin → Check-in, or the partner portal) checks the signature, the status (CONFIRMED / seat PAID) and the date.
  - It sets `checkedInAt` **once**. A second scan shows "Already checked in".
  - It shows the balance to collect.
- Ticket emails include the QR as an inline PNG, plus a "Download / print" link.

### 4.7 Trip start (QR scan)
- Endpoint: `POST /api/checkin { code, sig?, force? }`. Staff or partner auth is required, and a partner can only scan their own trips (or any trip, if the owner allows it in settings).
- Valid when the booking is CONFIRMED (or the shared seat is PAID) and the date is today. Another date needs `force`, which is logged.
- Inside one transaction:
  - set `status=STARTED`, `startedAt`, `startedBy`;
  - create the `PayoutLine`s (jeep fee × jeeps, tracker fee × jeeps, meal cost × meals, camera cost) using the fees in Settings **at that moment**;
  - write an ActivityLog row.
- After the transaction commits:
  - email `cust_started` to the guest, and `admin_started` if that's switched on;
  - push a live update to the dashboard. Server-sent events are enough; polling every 30s is fine for v1.
- A second scan returns "already started at hh:mm" and changes nothing.
- For a **shared** trip, the first scanned seat starts the trip. Every later seat scan just marks that seat checked in.
- The trip ends when the partner taps "Trip finished", or automatically at session end + 2h (cron). It becomes COMPLETED and `cust_thanks` is sent.

### 4.8 Profit & partner payouts
- Revenue per trip = the booking total (private) or the sum of paid seats (shared). Refunds are subtracted.
- Partner cost per trip = the sum of its PayoutLines. Profit = revenue − partner cost. Margin = profit / revenue.
- Admin → Payments & profit has four tabs:
  - **Overview**: revenue, costs, profit, amount owed to partners, weekly stacked bars, and profit by session and by type.
  - **Profit per trip**: a table with totals, a drawer for each trip, and CSV export.
  - **Partner payouts**: what each partner is owed. "Pay" lets admin pick lines and enter method + reference, creates a `Payout`, marks the lines PAID and emails `vendor_payout`.
  - **Customer payments**: money in, refunds, and balances to collect at pickup.
- Partner portal → Payments shows what they're owed, their paid history (with references), a line for each trip, and a CSV statement.
- Chart colours (validated for colour-blind safety): cost `#c46a2a` / dark `#d0773a`, profit `#1f6fa0` / dark `#3a9ad6`.

### 4.9 Meals
- With "Meal pack" on, the checkout shows one dropdown per guest (default Non-veg), a "same for everyone" shortcut, and an allergy note.
- Shared trips: one dropdown per seat.
- The summary of meal choices (e.g. "2× Vegetarian, 1× Kids meal") appears in the admin drawer, the partner job card, `vendor_job`, `admin_new_private` and `cust_confirmed`.

### 4.10 Pickup
- Hotel pickup is free within `pickupRadiusKm` (default 7) of the base location. Check the distance on the server.
- Outside the radius: the customer must choose "come to the office".
- Pickup time comes from the session (e.g. 5:00 AM for a 5:30 AM start).

---

## 5. Emails (see `emails/index.html` for content)

| Template | To | Trigger |
|---|---|---|
| `admin_new_private` | company alert addresses | any new private booking |
| `admin_new_shared` | company | seat booked on a shared trip |
| `admin_vendor_app` | company | partner application submitted |
| `cust_request` | customer | AT_PICKUP booking created (REQUEST) |
| `cust_confirmed` | customer | booking becomes CONFIRMED (**contains the QR e-ticket**) |
| `cust_reminder` | customer | 24h before start (cron) |
| `cust_shared_pay` | customer | shared trip reaches minSeats held |
| `cust_shared_ticket` | customer | shared seat paid **and** trip confirmed (**QR**) |
| `cust_shared_cancel` | customer | shared trip auto-cancelled, refund sent |
| `vendor_job` | partner | admin assigns a partner (Accept / Decline links) |
| `vendor_approved` | partner | application approved (portal login) |
| `cust_started` | customer | driver scans the ticket (trip started) |
| `cust_thanks` | customer | trip finished (thank-you + review link) |
| `admin_started` | company | trip started (optional) |
| `vendor_payout` | partner | payout marked paid (statement lines) |
| `vendor_login` | partner | login link requested |

- Send emails through a queue or outbox table with retries, and log each one in `EmailLog`.
- Admin → Settings → Emails & alerts turns each event on or off, and sets the company recipient list.
- **Email only.** Do not build SMS or WhatsApp sending. Admin can still share a shared-trip link manually from their own phone.

---

## 6. Pages and routes

**Public** (`(site)`):
| Route | Prototype |
|---|---|
| `/` | `customer/index.html` |
| `/book/session` | `01-session` |
| `/book/date` | `02-date` |
| `/book/group` | `03-group` |
| `/book/pickup` | `04-pickup-extras` |
| `/book/checkout` | `05-checkout` |
| `/book/done/[code]` | `06-confirmation` |
| `/t/[code]` | `ticket` |
| `/booking` | `my-booking` (lookup by code + phone) |
| `/s/[tripId]` | `shared/trip.html` |
| `/partners/apply` | `vendor/register.html` |

- Keep the booking state in the URL (as the prototype does) or in a short-lived draft row. **Recompute everything on the server at checkout.**

**Admin** (`(admin)`, login required): `/admin/login`, `/admin` (with the live trips panel), `/admin/bookings`, `/admin/shared`, `/admin/payments`, `/admin/partners`, `/admin/check-in`, `/admin/settings`. Only owners can change prices and settings.

**Partner** (`(partner)`): `/partner/login`, and `/partner` with tabs home / jobs / scan tickets / payments / availability / profile. Design it phone-first.

**API sketch:**
```
GET  /api/availability?date&session             → { jeepsFree }
GET  /api/calendar?month&session                 → per-day jeepsFree / closed
POST /api/bookings                               → creates booking, returns {code, checkoutUrl?}
GET  /api/bookings/lookup?code&phone
POST /api/bookings/:code/cancel                  (guest; needs code+phone)
POST /api/payments/webhook                       (verify signature!)
GET  /api/shared/:tripId                         (public seat map: seat numbers + taken flags only)
POST /api/shared/:tripId/seats                   (take seat(s), transaction + lock)
POST /api/partners/apply                         (multipart; documents to private storage)
POST /api/checkin                                { code, sig? } staff/partner auth
/api/admin/*  bookings (confirm, decline, assign, record-payment, cancel, create), shared (create, add/remove guest, mark-paid, cancel, remind), partners (approve, reject, pause, payout), settings
/api/partner/* jobs (accept/decline/finish), days-off, payments, statement.csv, profile
/api/admin/payments/* overview?from&to, trips?from&to (+csv), payout-lines?partner, payouts (POST)
/api/admin/live (SSE stream of started/finished events)
/api/cron/{release-seats, shared-autocancel, reminders, complete-trips}  (secret header)
```

---

## 7. Settings (defaults from the prototype)

These are placeholders. The real values come from the owner.

| Setting | Default |
|---|---|
| Morning | 5:30–10:30, pickup 5:00, private LKR 38,000, seat LKR 7,500 |
| Evening | 14:30–18:30, pickup 14:00, private LKR 38,000, seat LKR 7,500 |
| Full day | 5:30–18:30, pickup 5:00, private LKR 72,000, seat LKR 15,000 |
| Extras | Meal pack 1,500/person, Binoculars 1,000/booking, Camera 3,500/booking |
| Fleet / jeep size | 4 jeeps per session; max 6 people per jeep |
| Deposit | 30% |
| Shared trips | 6 seats, minimum 4 paid, 24h payment window, auto-cancel 24h before |
| Pickup radius | 7 km from the office (Tissamaharama) |
| Cancellation | over 48h 100%, 24–48h 50%, under 24h 0% |
| Partner fees | Jeep + driver: 12,000 (morning/evening), 22,000 (full day) per jeep. Tracker: 4,000 / 7,000 per jeep. Meal pack cost: 900 each. Camera rental cost: 1,500. |

---

## 8. Security checklist (from the review of the old repo)

- Never take the payment amount from the client. Verify payment webhooks with the provider's signature.
- Every admin and partner endpoint checks the role. Partners only see their own jobs and payouts.
- The public shared-trip API returns **seat numbers only**, never other guests' names or phones.
- Guest lookup needs both the code **and** a matching phone number. Rate-limit it.
- Keep partner documents in private storage and serve them with signed URLs.
- Rate-limit login, OTP, lookup and booking creation. Add a CAPTCHA to the partner form if spam appears.
- Ticket QR uses an HMAC signature, and check-in works once only.
- Payout lines and profit are calculated on the server from the fees saved at trip start, so editing fees later never changes past trips.

---

## 9. Build order (each step should work end to end)

1. Scaffold, DB schema, seed (owner user + settings + sessions + extras), design tokens.
2. Public private-booking flow with a mock payment → booking saved → emails (`admin_new_private`, `cust_confirmed` with QR).
3. Ticket page `/t/[code]` and booking lookup/cancel.
4. Admin login, dashboard, bookings list and drawer (confirm, decline, assign, record payment, cancel, phone booking).
5. Shared trips: admin create, link page, seats, the 4-seat rules, cron jobs, shared emails.
6. Partner application, admin approve/reject, partner login, jobs accept/decline, days off.
7. Check-in = trip start (admin and partner) with QR scanning (e.g. `@zxing/browser`): STARTED status, emails, payout lines, live dashboard.
7b. Payments & profit page, partner payouts, partner payments tab.
8. Settings page wired to the `Setting` table.
9. Real payment provider, reminders, payouts, polish, tests (unit tests for pricing, availability, the shared-seat state machine and refunds).

---

## 10. Using this with Claude Code

1. Put this whole folder in your repo as `/design-prototype`.
2. Start Claude Code in the repo and say something like:
   > Read `design-prototype/BUILD_SPEC.md` and open the HTML files in `design-prototype/`. Build step 1 and 2 of the build order using the suggested stack. Match the prototype's layout, copy and colours. Ask me before choosing the payment provider.
3. Then go step by step through §9.
