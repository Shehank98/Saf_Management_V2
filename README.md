# Yala Wild Safaris: safari booking platform

One Node.js service (Express + PostgreSQL) serving:
- the public booking site (private safaris, e-ticket QR, find-my-booking, link-only shared trips),
- the admin panel (bookings, shared trips, payments & profit, partners, check-in, settings),
- the partner portal (jobs, camera ticket scanning, payments, days off),
- all three installable on a phone's home screen (PWA),
- emails through a Google Apps Script relay, payments through Stripe / PayHere (or a test gateway).

The look and flow come from the clickable prototype in `design-prototype/`; the rules come from `design-prototype/BUILD_SPEC.md`.

| Folder | What |
|---|---|
| `server/` | Express app, services, SQL schema, scheduler |
| `server/pages/` | the page HTML (converted from the prototype by `tools/build_pages.py`) |
| `public/` | CSS, browser JS (`assets/pages/*.js`), icons, manifests' icons, service worker |
| `appscript/` | `Code.gs` email relay for Google Apps Script |
| `docs/` | `DEPLOY.md` (Railway), `APPS_SCRIPT.md` |
| `tests/` | unit tests and end-to-end tests against real Postgres |

Deploy: see [docs/DEPLOY.md](docs/DEPLOY.md). Marketing copy on the home page is in `server/pages/customer/index.html`.

Known v1 limits: one jeep partner and one tracker per booking (the fee is multiplied by jeeps); meal supplier is the first active supplier unless assigned in the database; shared-trip reminders by email are the payment links only.
