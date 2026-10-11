# Email through Google Apps Script

The server builds each email and posts it to a small Google Apps Script web app that sends it from your Google account. No SMTP, no extra email service.

## Setup (about 5 minutes)
1. Go to <https://script.google.com> → **New project**. Name it "Safari email relay".
2. Replace the contents of `Code.gs` with [`appscript/Code.gs`](../appscript/Code.gs).
3. (Recommended) Project Settings → tick **Show appsscript.json**, then paste in [`appscript/appsscript.json`](../appscript/appsscript.json). It limits the script to sending email only.
4. Run the function **`setup`** (▶). Approve the permissions. Open *Execution log*: it prints a `RELAY_SECRET`. Copy it. (You can also set `RELAY_SECRET` yourself in Project Settings → Script properties.)
5. Run **`testSend`** to email yourself a test.
6. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Copy the Web app URL.
7. On Railway add `APPS_SCRIPT_URL` = that URL and `APPS_SCRIPT_SECRET` = the secret from step 4. Redeploy.
8. In the admin: **Settings → Emails → Send test**.

"Anyone" only means the URL is reachable; every request must carry the secret, otherwise it is refused.

## After you change the script
Deploy → **Manage deployments → edit → New version**. The URL stays the same.

## Limits (Google)
About **100 emails/day on a free Gmail account** (1,500 on Google Workspace). One booking sends about 2 emails (guest + company), so a free account suits roughly 40 bookings a day. If you hit the limit the app keeps the emails and retries (Settings → Emails shows the status). Use a Workspace account or a dedicated Gmail for the business.
Emails come from the Google account that owns the script; replies go to the "Bookings email" in Settings.
