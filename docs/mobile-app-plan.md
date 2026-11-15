# Mobile app for admins and partners: is it possible?

**Short answer: yes, and it is easier than it sounds.** The app would talk to the same server and the same
database that the website already uses. Nothing needs to be copied or synced.

## How it fits today's system

```
 Phone app (admin / partner)  ─┐
 Website (guests)             ─┼──►  Node server (Express)  ──►  PostgreSQL
 Admin web panel              ─┘      same /api/... routes       one database
```

Every screen in the admin panel and partner portal already calls JSON routes such as `/api/admin/data`,
`/api/admin/shared/:id/start` and `/api/admin/reports/money-flow`. A mobile app calls the same routes, so every
feature (trips, seats, check-in scan, payments, payouts, PDF report) stays identical and always up to date.

## Three ways to build it (cheapest first)

| Option | What it is | Effort | Good for |
|---|---|---|---|
| **1. Installable web app (PWA)** | Already in place: the site has a manifest and service worker, so "Add to home screen" gives an app icon, full-screen window and push notifications. | Done | Start now, zero cost |
| **2. Capacitor wrapper** | The same web pages packaged as a real Android/iOS app that can be listed in Play Store / App Store. Adds native camera for QR scanning, push, background location for drivers. | About 1–2 weeks | Best value: one code base |
| **3. Native app (React Native / Flutter)** | New screens written from scratch, talking to the same API. | 2–4 months | Only if you later need a very custom feel |

**Recommendation:** use option 1 today, build option 2 when you want store listings. Skip option 3 for now.

## What needs to change on the server (small)

1. **Token login for apps.** The website uses a cookie session. Native apps are happier with a token:
   add `POST /api/auth/token` (email + password → short-lived token + refresh token) and let the existing
   `staff` / partner middleware also accept `Authorization: Bearer …`.
2. **Push notifications.** `web-push` is already used for the web. For store apps add Firebase Cloud Messaging
   (Android) and Apple Push (iOS) through one provider.
3. **Versioned API.** Keep routes stable under `/api/v1` so an old app version never breaks when the website changes.
4. **Rate limits and HTTPS only.** Already in place, just keep them on.

## Who uses what

- **Admins / office:** today's trips, seat map, add guest, mark paid, check-in scanner, payments summary,
  download the PDF money-flow report.
- **Vendors (jeep drivers, trackers):** accept jobs, "Pick up next" pickup run with map, scan tickets,
  start the safari, see what they are owed and what has been paid.

## Costs and accounts you would need

- Google Play developer account: one-time about USD 25.
- Apple Developer Program: about USD 99 per year (needed for the App Store and for iPhone push).
- Firebase (push): free tier is enough.
- Hosting stays the same.

## Suggested plan

1. Week 0: tell vendors and the office to install the PWA (works today).
2. Week 1: add token login and `/api/v1`.
3. Week 2: wrap with Capacitor, add camera scanner and push, test on two real phones.
4. Week 3: publish to Play Store, then App Store.
