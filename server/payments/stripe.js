// Stripe Checkout (hosted page) over the plain REST API, no SDK needed.
const crypto = require('crypto');
const config = require('../config');

const API = 'https://api.stripe.com/v1';
// Stripe amounts are in the smallest currency unit. LKR has 2 decimals; set STRIPE_CURRENCY to change currency.
const ZERO_DECIMAL = new Set(['jpy', 'krw', 'vnd', 'clp', 'pyg', 'ugx', 'xof', 'xaf']);
const minor = (amount) => ZERO_DECIMAL.has(config.stripeCurrency) ? Math.round(amount) : Math.round(amount * 100);
const major = (n) => ZERO_DECIMAL.has(config.stripeCurrency) ? n : n / 100;

async function call(method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + config.stripeSecretKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body, signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Stripe: ' + ((json.error && json.error.message) || res.status));
  return json;
}

module.exports = {
  id: 'stripe',
  label: 'International cards (Stripe)',
  configured: () => !!config.stripeSecretKey,

  async createCheckout({ payment, description, successUrl, cancelUrl, customerEmail }) {
    const p = {
      mode: 'payment', success_url: successUrl, cancel_url: cancelUrl,
      'line_items[0][price_data][currency]': config.stripeCurrency,
      'line_items[0][price_data][unit_amount]': String(minor(payment.amount)),
      'line_items[0][price_data][product_data][name]': description,
      'line_items[0][quantity]': '1',
      client_reference_id: String(payment.id),
      'metadata[payment_id]': String(payment.id),
      'payment_intent_data[metadata][payment_id]': String(payment.id),
      expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
    };
    if (customerEmail) p.customer_email = customerEmail;
    const s = await call('POST', '/checkout/sessions', p);
    return { providerRef: s.id, url: s.url };
  },

  /** Ask Stripe directly (used when the guest returns before the webhook arrives). */
  async fetchStatus(payment) {
    const s = await call('GET', '/checkout/sessions/' + encodeURIComponent(payment.provider_ref));
    return { paid: s.payment_status === 'paid', amount: major(s.amount_total || 0), meta: { payment_intent: s.payment_intent } };
  },

  async refund(payment, amount) {
    let pi = payment.meta && payment.meta.payment_intent;
    if (!pi) pi = (await this.fetchStatus(payment)).meta.payment_intent;
    if (!pi) throw new Error('No Stripe payment_intent for this payment');
    const r = await call('POST', '/refunds', { payment_intent: pi, amount: String(minor(amount)) });
    return { ok: true, ref: r.id };
  },

  /** Verify the Stripe-Signature header and translate the event. */
  async verifyWebhook(req) {
    const header = req.headers['stripe-signature'] || '';
    const parts = Object.fromEntries(header.split(',').map(x => x.split('=')));
    if (!config.stripeWebhookSecret || !parts.t || !parts.v1) throw new Error('Missing Stripe signature');
    const expected = crypto.createHmac('sha256', config.stripeWebhookSecret).update(`${parts.t}.${req.rawBody}`).digest('hex');
    const a = Buffer.from(expected), b = Buffer.from(parts.v1);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Bad Stripe signature');
    if (Math.abs(Date.now() / 1000 - +parts.t) > 300) throw new Error('Stale Stripe webhook');
    const ev = JSON.parse(req.rawBody);
    const o = ev.data && ev.data.object;
    if (!o) return null;
    if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
      if (o.payment_status !== 'paid') return null;
      return { type: 'succeeded', providerRef: o.id, amount: major(o.amount_total || 0), meta: { payment_intent: o.payment_intent } };
    }
    if (ev.type === 'checkout.session.expired' || ev.type === 'checkout.session.async_payment_failed') {
      return { type: 'failed', providerRef: o.id };
    }
    return null;
  },
};
