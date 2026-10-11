// Test gateway: no real money moves. Enabled by PAYMENT_PROVIDERS=mock (or automatically outside production).
module.exports = {
  id: 'mock',
  label: 'Test payment (no real money)',
  configured: () => true,
  async createCheckout({ payment, base }) {
    return { providerRef: 'mock_' + payment.id, url: `${base}/pay/mock/${payment.id}` };
  },
  async refund(payment, amount) { return { ok: true, ref: 'mock_refund_' + payment.id + '_' + Date.now() }; },
  async verifyWebhook() { return null; },
};
