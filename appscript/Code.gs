/**
 * Yala Wild Safaris: email relay (Google Apps Script web app)
 * ------------------------------------------------------------------
 * The Railway server builds every email (subject, HTML, QR code image) and POSTs it here.
 * This script checks a shared secret, then sends the message from YOUR Google account.
 *
 * Setup (5 minutes), full steps in docs/APPS_SCRIPT.md:
 *   1. script.google.com -> New project -> paste this file (and appsscript.json, see below).
 *   2. Project Settings -> Script properties -> add  RELAY_SECRET  = a long random string.
 *   3. Run the function  setup()  once and approve the permissions.
 *   4. Deploy -> New deployment -> type "Web app" -> Execute as: Me -> Who has access: Anyone.
 *   5. Copy the Web app URL. On Railway set  APPS_SCRIPT_URL = that URL  and
 *      APPS_SCRIPT_SECRET = the same RELAY_SECRET.
 *
 * Limits (Google): about 100 emails a day on a free Gmail account, about 1,500 a day on Google Workspace.
 * Each message is one email to one person, so a new booking uses about 2 (guest + company).
 */

var MAX_HTML_BYTES = 400 * 1024;   // refuse oversized messages
var MAX_INLINE_IMAGES = 3;

/** The server calls this with JSON: { secret, to, subject, html, inline:[{cid,mime,base64}], replyTo, fromName } */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET');
    if (!secret) return reply_({ ok: false, error: 'RELAY_SECRET is not set in Script properties.' });
    if (!safeEquals_(String(body.secret || ''), secret)) return reply_({ ok: false, error: 'Unauthorized' });

    var to = String(body.to || '').trim();
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)) return reply_({ ok: false, error: 'Invalid recipient' });
    var subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250);
    var html = String(body.html || '');
    if (!subject || !html) return reply_({ ok: false, error: 'Missing subject or html' });
    if (html.length > MAX_HTML_BYTES) return reply_({ ok: false, error: 'Message too large' });

    if (MailApp.getRemainingDailyQuota() < 1) return reply_({ ok: false, error: 'Daily email quota reached. It resets within 24 hours.' });

    var options = { htmlBody: html, name: String(body.fromName || 'Yala Wild Safaris').slice(0, 80) };
    if (body.replyTo && /^[^\s@,;<>]+@[^\s@,;<>]+$/.test(String(body.replyTo))) options.replyTo = String(body.replyTo);

    var inline = {};
    (body.inline || []).slice(0, MAX_INLINE_IMAGES).forEach(function (img) {
      if (!img || !img.cid || !img.base64) return;
      inline[String(img.cid)] = Utilities.newBlob(Utilities.base64Decode(img.base64), String(img.mime || 'image/png'), String(img.cid) + '.png');
    });
    if (Object.keys(inline).length) options.inlineImages = inline;

    MailApp.sendEmail(to, subject, htmlToText_(html), options);
    return reply_({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/** Open the Web app URL in a browser to check it is alive (no secrets are revealed). */
function doGet() {
  return reply_({ ok: true, service: 'Yala Wild Safaris email relay', remainingToday: MailApp.getRemainingDailyQuota() });
}

/** Run once from the editor: creates a secret if you have not set one, and triggers the permission prompt. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('RELAY_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('RELAY_SECRET', secret);
  }
  Logger.log('RELAY_SECRET (copy this into Railway as APPS_SCRIPT_SECRET):\n' + secret);
  Logger.log('Emails left today: ' + MailApp.getRemainingDailyQuota());
}

/** Run from the editor to send yourself a test email (also checks inline images work). */
function testSend() {
  var me = Session.getEffectiveUser().getEmail();
  var png = Utilities.newBlob(Utilities.base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), 'image/png', 'dot.png');
  MailApp.sendEmail(me, 'Test from the safari email relay', 'It works.', {
    htmlBody: '<p style="font:15px Arial">It works! <img src="cid:dot" width="8" height="8"></p>',
    inlineImages: { dot: png }, name: 'Yala Wild Safaris'
  });
  Logger.log('Sent a test email to ' + me);
}

/* ---------- helpers ---------- */
function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
/** Constant-time string comparison. */
function safeEquals_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function htmlToText_(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|tr|div|h\d|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}
