/**
 * Safari email relay (Google Apps Script web app)
 * ------------------------------------------------------------------
 * Your Railway server designs every email (subject, HTML, buttons, QR code image)
 * and sends it here. This script checks a shared secret and then sends the message
 * from YOUR Google account. It never stores anything unless you switch on the
 * optional Sheet log below.
 *
 * SETUP (about 5 minutes)
 *   1. Go to script.google.com, click New project, paste this whole file into Code.gs.
 *   2. Project Settings (gear icon), tick "Show appsscript.json manifest file",
 *      then paste the contents of appsscript.json from the repo.
 *   3. Run the function  setup()  once (press Run) and approve the permission screen.
 *      Open View > Logs: it prints a RELAY_SECRET. Copy it.
 *   4. Run  testSend()  to email yourself a sample.
 *   5. Deploy > New deployment > type "Web app":
 *        Execute as: Me
 *        Who has access: Anyone
 *      Copy the Web app URL.
 *   6. On Railway add two variables and redeploy:
 *        APPS_SCRIPT_URL    = the Web app URL
 *        APPS_SCRIPT_SECRET = the RELAY_SECRET from step 3
 *   7. In the admin panel go to Settings > Emails and press "Send sample".
 *
 * OPTIONAL Script properties (Project Settings > Script properties)
 *   ARCHIVE_BCC   An email address that gets a hidden copy of every email (for your records).
 *   LOG_SHEET_ID  The ID of a Google Sheet. Every email is logged there as one row
 *                 (time, to, subject, result). The ID is the long text in the Sheet's address.
 *
 * GOOGLE LIMITS
 *   About 100 emails a day on a free Gmail account, about 1,500 on Google Workspace.
 *   One booking sends about 2 emails (guest and company). If the limit is hit, the server
 *   keeps the emails and tries again later.
 *
 * After you edit this script: Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 * The Web app URL stays the same.
 */

var MAX_HTML_CHARS = 400000;   // refuse oversized messages
var MAX_INLINE_IMAGES = 3;     // QR code etc.
var EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * The server calls this with JSON:
 * { secret, to, subject, html, inline: [{ cid, mime, base64 }], replyTo, fromName }
 */
function doPost(e) {
  var to = '';
  var subject = '';
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('RELAY_SECRET');

    if (!secret) {
      return reply_({ ok: false, error: 'RELAY_SECRET is not set. Run setup() in the script editor.' });
    }
    if (!safeEquals_(String(body.secret || ''), secret)) {
      return reply_({ ok: false, error: 'Unauthorized' });
    }

    to = String(body.to || '').trim();
    if (!EMAIL_RE.test(to)) {
      return reply_({ ok: false, error: 'Invalid recipient' });
    }
    subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250);
    var html = String(body.html || '');
    if (!subject || !html) {
      return reply_({ ok: false, error: 'Missing subject or html' });
    }
    if (html.length > MAX_HTML_CHARS) {
      return reply_({ ok: false, error: 'Message too large' });
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      return reply_({ ok: false, error: 'Daily email quota reached. It resets within 24 hours.' });
    }

    var options = {
      htmlBody: html,
      name: String(body.fromName || 'Yala Wild Safaris').slice(0, 80)
    };
    if (body.replyTo && EMAIL_RE.test(String(body.replyTo))) {
      options.replyTo = String(body.replyTo);
    }
    var archive = props.getProperty('ARCHIVE_BCC');
    if (archive && EMAIL_RE.test(archive)) {
      options.bcc = archive;
    }

    var inline = {};
    var images = (body.inline || []).slice(0, MAX_INLINE_IMAGES);
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      if (!img || !img.cid || !img.base64) continue;
      inline[String(img.cid)] = Utilities.newBlob(
        Utilities.base64Decode(img.base64),
        String(img.mime || 'image/png'),
        String(img.cid) + '.png'
      );
    }
    if (Object.keys(inline).length) {
      options.inlineImages = inline;
    }

    MailApp.sendEmail(to, subject, htmlToText_(html), options);
    log_(props, to, subject, 'sent');
    return reply_({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    var message = String(err && err.message ? err.message : err);
    try { log_(PropertiesService.getScriptProperties(), to, subject, 'error: ' + message); } catch (ignore) {}
    return reply_({ ok: false, error: message });
  }
}

/** Open the Web app URL in a browser to check that it is alive. No secrets are shown. */
function doGet() {
  return reply_({
    ok: true,
    service: 'Safari email relay',
    emailsLeftToday: MailApp.getRemainingDailyQuota()
  });
}

/**
 * Run this once from the editor. It creates a secret (if you have not set one)
 * and triggers the permission screen. The secret is shown in View > Logs.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('RELAY_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('RELAY_SECRET', secret);
  }
  Logger.log('Copy this into Railway as APPS_SCRIPT_SECRET:');
  Logger.log(secret);
  Logger.log('Emails you can still send today: ' + MailApp.getRemainingDailyQuota());
}

/** Run this to email yourself a sample that looks like the real emails (button, card, inline image). */
function testSend() {
  var me = Session.getEffectiveUser().getEmail();
  var dot = Utilities.newBlob(
    Utilities.base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
    'image/png',
    'dot.png'
  );
  var f = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  var html =
    '<div style="background:#f2f0ec;padding:28px 12px">' +
    '<div style="max-width:600px;margin:0 auto">' +
    '<div style="font:bold 18px Georgia,serif;color:#1c1917;padding:0 4px 14px">Email relay</div>' +
    '<div style="background:#ffffff;border:1px solid #e7e5e4;border-top:3px solid #b45f24;border-radius:8px;padding:34px 36px;' + f + '">' +
    '<div style="font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b45f24">Test email</div>' +
    '<div style="font:bold 25px Georgia,serif;color:#1c1917;margin-top:10px">Your email relay works</div>' +
    '<p style="color:#3f3a36;font-size:15px;line-height:1.65;margin:20px 0 0">This is how buttons and details look in your booking emails.</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e7e5e4;border-radius:8px">' +
    '<tr><td style="padding:11px 16px;color:#78716c;font-size:13px;width:36%">Booking</td><td style="padding:11px 16px;font-weight:600;font-size:14px;color:#1c1917">TEST-0001</td></tr>' +
    '<tr><td style="padding:11px 16px;border-top:1px solid #e7e5e4;color:#78716c;font-size:13px">Inline image</td><td style="padding:11px 16px;border-top:1px solid #e7e5e4;font-size:14px"><img src="cid:dot" width="8" height="8" alt=""> loaded</td></tr></table>' +
    '<a href="https://script.google.com" style="display:block;text-align:center;background:#1c1917;color:#ffffff;' +
    'text-decoration:none;font-weight:600;font-size:15px;padding:14px;border-radius:8px">Open my e-ticket</a>' +
    '</div></div></div>';
  MailApp.sendEmail(me, 'Test from the safari email relay', 'It works.', {
    htmlBody: html,
    inlineImages: { dot: dot },
    name: 'Safari email relay'
  });
  Logger.log('Sent a test email to ' + me);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Compare two strings in constant time so the secret cannot be guessed by timing. */
function safeEquals_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Optional: add one row per email to a Google Sheet (set LOG_SHEET_ID in Script properties). */
function log_(props, to, subject, result) {
  var id = props.getProperty('LOG_SHEET_ID');
  if (!id) return;
  var sheet = SpreadsheetApp.openById(id).getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Time', 'To', 'Subject', 'Result']);
  }
  sheet.appendRow([new Date(), to, subject, result]);
}

/** Plain text version for email apps that do not show HTML. */
function htmlToText_(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<span style="display:none[\s\S]*?<\/span>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|div|h\d|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 6000);
}
