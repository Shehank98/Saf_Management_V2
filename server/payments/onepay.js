// OnePay (Sri Lanka, https://onepay.lk). Hosted checkout link over their v3 REST API.
// Flow: POST /v3/checkout/link/ -> send the guest to data.gateway.redirect_url -> OnePay calls our callback
// URL (set it in the OnePay dashboard) -> we never trust the callback body and confirm with /v3/transaction/status/.
const crypto = require('crypto');
const config = require('../config');

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

async function call(path, body) {
  const res = await fetch(config.onepayBaseUrl + path, {
    method: 'POST',
    headers: { Authorization: config.onepayAppToken, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = json && (json.message || (json.data && (json.data.message || json.data.error)) || json.error);
    throw new Error('OnePay: ' + (typeof d === 'string' ? d : res.status));
  }
  return json;
}

async function status(transactionId) {
  const j = await call('/v3/transaction/status/', { app_id: config.onepayAppId, onepay_transaction_id: transactionId });
  const d = j.data || {};
  return { paid: d.status === true || d.status === 1 || d.status === '1', amount: d.amount != null ? parseFloat(d.amount) : null, amountCurrency: 'LKR' };
}

module.exports = {
  id: 'onepay',
  label: 'Sri Lankan cards (OnePay)',
  configured: () => !!(config.onepayAppId && config.onepayAppToken && config.onepayHashSalt),

  async createCheckout({ payment, successUrl, customer = {}, customerEmail }) {
    // OnePay charges Sri Lankan rupees: USD bookings are converted with the rate saved on the booking.
    const lkr = payment.currency === 'USD' ? Math.round(payment.amount * (+payment.fx || 1)) : payment.amount;
    const amount = Number(lkr).toFixed(2), currency = 'LKR';
    const [first, ...rest] = String(customer.name || 'Guest').trim().split(/\s+/);
    const j = await call('/v3/checkout/link/', {
      currency, app_id: config.onepayAppId,
      hash: sha256(config.onepayAppId + currency + amount + config.onepayHashSalt),
      amount: parseFloat(amount), reference: 'OP' + payment.id,
      customer_first_name: first || 'Guest', customer_last_name: rest.join(' ') || '-',
      customer_phone_number: String(customer.phone || '').replace(/[^\d+]/g, '') || '+94000000000',
      customer_email: customerEmail || customer.email || '',
      transaction_redirect_url: successUrl,
      additionalData: String(payment.id),
    });
    const d = j.data || {};
    const url = d.gateway && d.gateway.redirect_url;
    if (!url || !d.ipg_transaction_id) throw new Error('OnePay did not return a payment link');
    return { providerRef: String(d.ipg_transaction_id), url };
  },

  /** Ask OnePay directly (used when the guest returns before the callback). */
  fetchStatus: (payment) => status(payment.provider_ref),

  /** Callback body is {transaction_id, status, ...}; confirm it against the status API before trusting it. */
  async verifyWebhook(req) {
    const b = req.body || {};
    const id = String(b.transaction_id || b.onepay_transaction_id || '');
    if (!id) throw new Error('OnePay callback without transaction_id');
    const s = await status(id);
    if (s.paid) return { type: 'succeeded', providerRef: id, amount: s.amount, amountCurrency: 'LKR', meta: { onepay: id } };
    if (String(b.status) === '0' || b.status === false) return { type: 'failed', providerRef: id };
    return null;
  },

  // OnePay refunds are done in the OnePay merchant dashboard; we record them as manual.
  async refund() { return { ok: false, manual: true, ref: null }; },
};
