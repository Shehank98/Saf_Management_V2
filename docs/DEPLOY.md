# Deploy on Railway (one service + Postgres)

The whole system (public site, admin, partner portal, API, scheduler) is **one Node service**. It only needs a PostgreSQL database.

## 1. Create the project
1. Railway → **New Project → Deploy from GitHub repo** → pick this repo and the branch you want to deploy.
2. In the project: **+ New → Database → Add PostgreSQL**.
3. Open the web service → **Variables** → add `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Reference).
4. Service → **Settings → Networking → Generate Domain**. (Later you can add your own domain.)

## 2. Variables (service → Variables)
| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NODE_ENV` | `production` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | your first owner login (used once; delete the password afterwards) |
| `APPS_SCRIPT_URL`, `APPS_SCRIPT_SECRET` | from [APPS_SCRIPT.md](APPS_SCRIPT.md) |
| `PAYMENT_PROVIDERS` | `mock` to try it first, then `stripe`, `payhere` or `stripe,payhere` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | see Stripe below |
| `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET`, `PAYHERE_SANDBOX` | see PayHere below |

Tables are created automatically on start. Nothing else to run. Health check: `/healthz`.

## 3. First login
Open `https://YOUR-DOMAIN/admin`, sign in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`, then **Settings** to set prices, times, your email addresses and pickup base. Remove `ADMIN_PASSWORD` from Railway variables.

## 4. Stripe
1. Dashboard → Developers → API keys → copy the **secret key** → `STRIPE_SECRET_KEY`.
2. Developers → Webhooks → **Add endpoint**: `https://YOUR-DOMAIN/api/payments/webhook/stripe`, event `checkout.session.completed` (and `checkout.session.expired`). Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Guests pay on Stripe's hosted page; card details never touch your server. Amounts always come from the server.
4. **Check that your Stripe account can be paid out in Sri Lanka and can charge in LKR.** If not, set `STRIPE_CURRENCY=usd` (prices stay in LKR on your site; you would need a conversion rule) or use PayHere.

## 4b. PayHere (Sri Lanka)
Merchant ID and merchant secret come from the PayHere dashboard (Domains & Credentials). Add your site domain there. The notify URL is set for you: `/api/payments/webhook/payhere`. Keep `PAYHERE_SANDBOX=true` until you have tested, then set it to `false`. PayHere refunds are done in their dashboard; the app lists them under *Payments → Customer payments* for you to mark done.
With both enabled, guests are offered the choice at checkout. More local gateways can be added in `server/payments/`.

## 5. Phone app (home screen)
Nothing to build. Open the site on a phone:
- **Android/Chrome**: an "Add to your home screen" banner appears (or menu → Install app).
- **iPhone/Safari**: Share → **Add to Home Screen**.
Three separate apps install from three addresses: guests (`/`), staff (`/admin`), drivers and partners (`/partner`). Drivers can scan tickets with the phone camera. E-tickets and the driver's job list stay available offline.
Camera scanning and install need **HTTPS**, which Railway provides.

## 6. Scheduler
Reminders, seat releases, auto-cancel and email retries run inside the web service every few minutes. If you ever run more than one instance it is still safe. To trigger a job from outside instead, set `DISABLE_INTERNAL_SCHEDULER=1` and call `POST /api/cron/<job>` with header `x-cron-secret`. Jobs: `release-seats`, `shared-autocancel`, `reminders`, `complete-trips`, `daily-summary`, `outbox`.

## 7. Backups
Use Railway's Postgres backups (or `pg_dump`). Partner documents are stored in the database, so one backup covers everything.

## Local development
```
cp .env.example .env     # then export the variables, or use your shell
npm install
PAYMENT_PROVIDERS=mock SEED_DEMO=1 ADMIN_EMAIL=a@b.lk ADMIN_PASSWORD=password123 npm run dev
npm test                  # set TEST_DATABASE_URL to an empty throwaway database for the end-to-end tests
```
