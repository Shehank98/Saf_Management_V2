// Gateway-facing endpoints: webhooks, the test (mock) checkout page and the PayHere form page.
const express = require('express');
const { query } = require('../db');
const providers = require('../payments');
const payhere = require('../payments/payhere');
const paymentsSvc = require('../services/payments');
const settings = require('../lib/settings');
const U = require('../lib/util');

const r = express.Router();

r.post('/api/payments/webhook/:provider', U.wrap(async (req, res) => {
  const prov = providers.get(req.params.provider);
  if (!prov || !providers.enabled().includes(prov)) return res.status(404).end();
  let ev;
  try { ev = await prov.verifyWebhook(req); } catch (e) { console.warn('[webhook] rejected:', e.message); return res.status(400).json({ error: 'bad signature' }); }
  if (!ev) return res.json({ ok: true, ignored: true });
  const pay = (await query('SELECT * FROM payments WHERE provider=$1 AND provider_ref=$2', [prov.id, ev.providerRef])).rows[0];
  if (!pay) { console.warn('[webhook] unknown payment', ev.providerRef); return res.json({ ok: true, unknown: true }); }
  if (ev.type === 'succeeded') await paymentsSvc.complete(pay.id, { amount: ev.amount, meta: ev.meta });
  else await paymentsSvc.fail(pay.id);
  res.json({ ok: true });
}));

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${U.esc(title)}</title>
<style>body{margin:0;background:#fbf6ea;font:16px/1.5 system-ui,sans-serif;color:#2b2118;display:grid;place-items:center;min-height:100vh;padding:16px}
.c{background:#fffdf7;border:1px solid #e3d4b6;border-radius:18px;padding:26px;max-width:420px;width:100%;box-shadow:0 10px 28px rgba(60,40,20,.1)}
h1{font:700 24px Georgia,serif;margin:0 0 6px}.m{color:#6f604f;font-size:14px}.amt{font:800 30px Georgia,serif;margin:14px 0}
button{font:inherit;font-weight:700;border-radius:12px;border:1px solid #e3d4b6;background:#fff;padding:13px 18px;cursor:pointer;width:100%;margin-top:10px}
button.p{background:#c0682a;border-color:#c0682a;color:#fff}.t{background:#dbeaf1;color:#2f6a8a;padding:8px 10px;border-radius:10px;font-size:13px}</style></head><body><div class="c">${body}</div></body></html>`;

r.get('/pay/mock/:id', U.wrap(async (req, res) => {
  if (!providers.enabled().includes(providers.get('mock'))) return res.status(404).end();
  const p = (await query(`SELECT * FROM payments WHERE id=$1 AND provider='mock'`, [+req.params.id])).rows[0];
  if (!p || p.status !== 'PENDING') return res.status(404).send(page('Payment', '<h1>Nothing to pay</h1><p class="m">This payment was already completed or has expired.</p>'));
  res.send(page('Test payment', `<div class="t">Test mode: no real money moves. Set up Stripe or PayHere for real payments.</div>
<h1>Pay ${U.esc(U.fmtLkr(p.amount))}</h1><p class="m">${U.esc((p.meta && p.meta.description) || 'Safari booking')}</p><div class="amt">${U.esc(U.fmtLkr(p.amount))}</div>
<button class="p" id="ok">Pay now (test)</button><button id="no">Cancel</button>
<script>const go=o=>fetch('/api/payments/mock/${p.id}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({outcome:o})}).then(r=>r.json()).then(j=>location.href=j.redirect||'/');
ok.onclick=()=>go('success');no.onclick=()=>go('cancel');</script>`));
}));

r.post('/api/payments/mock/:id', U.wrap(async (req, res) => {
  if (!providers.enabled().includes(providers.get('mock'))) return res.status(404).end();
  const p = (await query(`SELECT * FROM payments WHERE id=$1 AND provider='mock'`, [+req.params.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'Not found' });
  const base = settings.baseUrl(await settings.load());
  if (req.body.outcome === 'success') {
    await paymentsSvc.complete(p.id, { amount: p.amount });
    return res.json({ redirect: (p.meta && p.meta.successUrl) || base });
  }
  await paymentsSvc.fail(p.id);
  res.json({ redirect: (p.meta && p.meta.cancelUrl) || base });
}));

r.get('/pay/payhere/:id', U.wrap(async (req, res) => {
  const p = (await query(`SELECT * FROM payments WHERE id=$1 AND provider='payhere' AND status='PENDING'`, [+req.params.id])).rows[0];
  if (!p || !payhere.configured()) return res.status(404).send(page('Payment', '<h1>Nothing to pay</h1>'));
  const conf = await settings.load();
  const f = payhere.formFields({ payment: p, description: (p.meta && p.meta.description) || 'Safari booking', successUrl: p.meta.successUrl, cancelUrl: p.meta.cancelUrl, base: settings.baseUrl(conf), customer: p.meta.customer || {} });
  res.send(page('Redirecting to PayHere', `<h1>Taking you to PayHere…</h1><p class="m">Please wait a moment.</p>
<form id="f" method="post" action="${U.esc(f.action)}">${Object.entries(f.fields).map(([k, v]) => `<input type="hidden" name="${U.esc(k)}" value="${U.esc(v)}">`).join('')}<noscript><button class="p">Continue to PayHere</button></noscript></form><script>document.getElementById('f').submit()</script>`));
}));

module.exports = r;
