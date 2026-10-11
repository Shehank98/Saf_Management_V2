const rateLimit = require('express-rate-limit');
const U = require('../lib/util');

const MULT = +process.env.RATE_LIMIT_MULTIPLIER || 1; // tests raise this; production leaves it at 1
const limiter = (windowMin, max, message) => rateLimit({
  windowMs: windowMin * 60 * 1000, limit: max * MULT, standardHeaders: true, legacyHeaders: false,
  skip: req => req.path === '/config.js',   // loaded by <script> tags, so it must never answer with JSON errors
  handler: (req, res) => res.status(429).json({ error: message || 'Too many attempts. Please wait a few minutes and try again.' }),
});

const limits = {
  login: limiter(15, 15, 'Too many login attempts. Please wait 15 minutes.'),
  booking: limiter(60, 40),
  lookup: limiter(10, 25),
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
