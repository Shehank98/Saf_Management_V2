const rateLimit = require('express-rate-limit');
const U = require('../lib/util');

const MULT = +process.env.RATE_LIMIT_MULTIPLIER || 1; // tests raise this; production leaves it at 1
const limiter = (windowMin, max, message, skipIf = null) => rateLimit({
  windowMs: windowMin * 60 * 1000, limit: max * MULT, standardHeaders: true, legacyHeaders: false,
  skip: req => req.path === '/config.js' || (skipIf ? skipIf(req) : false), // config.js is loaded by <script> tags, so it must never answer with JSON errors
  handler: (req, res) => res.status(429).json({ error: message || 'Too many attempts. Please wait a few minutes and try again.' }),
});

function signed(req) {
  const code = (req.params && req.params.code) || (req.query && req.query.code) || (req.body && req.body.code);
  const k = (req.query && req.query.k) || (req.body && req.body.k);
  if (!code || !k) return false;
  try { return require('../lib/secrets').verify(U.normCode(code), String(k)); } catch { return false; }
}

const limits = {
  login: limiter(15, 15, 'Too many login attempts. Please wait 15 minutes.'),
  booking: limiter(60, 40),
  // Looking a booking up by code + phone number: strict, so codes can't be guessed. A request that already
  // carries the booking's signed link (?k=...) can't be a guess, so it doesn't count.
  lookup: limiter(10, 25, null, req => signed(req)),
  // Pages that refresh themselves (e-ticket, seat map, calendar, driver link): signed or read-only, so a
  // generous per-minute limit. Each limiter has its own counter, so a busy page never blocks another one.
  poll: limiter(1, 120),
  apply: limiter(60, 10),
  magic: limiter(15, 8),
  api: limiter(1, 300),
};

/** Reject cross-site form posts: if the browser sends an Origin it must be us. */
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/payments/webhook')) return next();
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* ignore */ }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  next();
}

module.exports = { limits, sameOrigin, wrap: U.wrap };
