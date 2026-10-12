const config = require('../config');
const mock = require('./mock');
const stripe = require('./stripe');
const payhere = require('./payhere');
const onepay = require('./onepay');

const ALL = { mock, onepay, stripe, payhere };

/** Providers the guest may use, in display order. */
function enabled() {
  let ids = [...config.paymentProviders];
  if (!ids.length) {
    if (onepay.configured()) ids.push('onepay');
    if (stripe.configured()) ids.push('stripe');
    if (payhere.configured()) ids.push('payhere');
    if (!ids.length && !config.isProd) ids.push('mock');
  }
  return ids.filter(id => ALL[id] && ALL[id].configured()).map(id => ALL[id]);
}
const get = id => ALL[id];
const list = () => enabled().map(p => ({ id: p.id, label: p.label }));

module.exports = { enabled, get, list };
