# Email through Google Apps Script

The server builds each email and posts it to a small Google Apps Script web app that sends it from your Google account. No SMTP, no extra email service.

## Setup (about 5 minutes)
1. Go to <https://script.google.com> → **New project**. Name it "Safari email relay".
2. Replace the contents of `Code.gs` with [`appscript/Code.gs`](../appscript/Code.gs).
3. (Recommended) Project Settings → tick **Show appsscript.json**, then paste in [`appscript/appsscript.json`](../appscript/appsscript.json). It lists the permissions the script needs: sending email, and (only used if you set `LOG_SHEET_ID`) writing to a Google Sheet.
4. Run the function **`setup`** (▶). Approve the permissions. Open *Execution log*: it prints a `RELAY_SECRET`. Copy it. (You can also set `RELAY_SECRET` yourself in Project Settings → Script properties.)
5. Run **`testSend`** to email yourself a sample with a button.
6. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Copy the Web app URL.
7. On Railway add `APPS_SCRIPT_URL` = that URL and `APPS_SCRIPT_SECRET` = the secret from step 4. Redeploy.
8. In the admin: **Settings → Emails → Send sample**. You receive a real looking booking confirmation with the QR code and buttons.

"Anyone" only means the URL is reachable; every request must carry the secret, otherwise it is refused.

## Optional extras (Script properties)
- `ARCHIVE_BCC`: an address that gets a hidden copy of every email.
- `LOG_SHEET_ID`: a Google Sheet ID; every email is logged as a row (time, to, subject, result).

## After you change the script
Deploy → **Manage deployments → edit → New version**. The URL stays the same.

## Limits (Google)
About **100 emails/day on a free Gmail account** (1,500 on Google Workspace). One booking sends about 2 emails (guest + company), so a free account suits roughly 40 bookings a day. If you hit the limit the app keeps the emails and retries (Settings → Emails shows the status). Use a Workspace account or a dedicated Gmail for the business.
Emails come from the Google account that owns the script; replies go to the "Bookings email" in Settings.

## Troubleshooting (Admin > Settings > Emails > Check connection tells you which one)
| Message in the log | Meaning and fix |
|---|---|
| `RELAY_SECRET is not set` | In the script editor run `setup()` and copy the secret it prints. |
| `Unauthorized` / Wrong secret | `APPS_SCRIPT_SECRET` on Railway must be exactly the `RELAY_SECRET` in Script properties. No spaces or quotes. |
| `replied 404` / URL is wrong | Deploy > Manage deployments, copy the current Web app URL into `APPS_SCRIPT_URL`. Use the URL that ends in `/exec`. |
| Web app is not public | Redeploy with Who has access = Anyone. |
Running `testSend()` in the editor only proves the script can send; it does not test the URL or the secret. Use **Check connection** and **Send sample** in the admin instead. After fixing, press **Retry all failed**.
