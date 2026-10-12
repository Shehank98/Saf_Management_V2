// PayHere (Sri Lanka). Checkout is a signed form POST to PayHere; the result arrives on notify_url.
const crypto = require('crypto');
const config = require('../config');

const md5 = s => crypto.createHash('md5').update(s).digest('hex').toUpperCase();
const secretHash = () => md5(config.payhereSecret);
const host = () => config.payhereSandbox ? 'https://sandbox.payhere.lk' : 'https://www.payhere.lk';

module.exports = {
  id: 'payhere',
  label: 'Sri Lankan cards & wallets (PayHere)',
  configured: () => !!(config.payhereMerchantId && config.payhereSecret),

  async createCheckout({ payment, base }) {
    return { providerRef: 'PH' + payment.id, url: `${base}/pay/payhere/${payment.id}` };
  },

  /** Fields for the auto-submitted form page (see routes/pay.js). */
  formFields({ payment, description, successUrl, cancelUrl, base, customer }) {
    const amount = Number(payment.amount).toFixed(2), currency = payment.currency === 'USD' ? 'USD' : 'LKR', orderId = 'PH' + payment.id;
    const [first, ...rest] = String(customer.name || 'Guest').split(' ');
    return {
      action: host() + '/pay/checkout',
      fields: {
        merchant_id: config.payhereMerchantId, return_url: successUrl, cancel_url: cancelUrl,
        notify_url: `${base}/api/payments/webhook/payhere`, order_id: orderId, items: description,
        currency, amount, first_name: first, last_name: rest.join(' ') || '-', email: customer.email || '',
        phone: customer.phone || '', address: customer.address || 'Sri Lanka', city: 'Tissamaharama', country: 'Sri Lanka',
        hash: md5(config.payhereMerchantId + orderId + amount + currency + secretHash()),
      },
    };
  },

  async verifyWebhook(req) {
    const b = req.body || {};
    const sig = md5(String(b.merchant_id) + b.order_id + b.payhere_amount + b.payhere_currency + b.status_code + secretHash());
    if (!b.md5sig || sig !== String(b.md5sig).toUpperCase() || String(b.merchant_id) !== config.payhereMerchantId) throw new Error('Bad PayHere signature');
    if (String(b.status_code) === '2') return { type: 'succeeded', providerRef: String(b.order_id), amount: parseFloat(b.payhere_amount), meta: { payment_id: b.payment_id } };
    if (['-1', '-2'].includes(String(b.status_code))) return { type: 'failed', providerRef: String(b.order_id) };
    return null;
  },

  // PayHere refunds need their merchant API (OAuth). Record it and let the owner refund from the PayHere dashboard.
  async refund() { return { ok: false, manual: true, ref: null }; },
};
