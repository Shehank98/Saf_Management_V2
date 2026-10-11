const express = require('express');
const auth = require('../lib/auth');
const trips = require('../services/trips');
const U = require('../lib/util');
const { limits } = require('./common');

const r = express.Router();

/** Pull code + signature out of whatever a scanner or a person typed (a full ticket link, or just the code). */
function parseScan(body) {
  let code = String(body.code || body.text || '').trim(), sig = body.sig || null;
  const m = code.match(/\/t\/([^/?#\s]+)(?:\?[^#]*?\bk=([A-Za-z0-9]+))?/i);
  if (m) { code = decodeURIComponent(m[1]); sig = m[2] || sig; }
  return { code, sig };
}

/** POST /api/checkin { code | text, sig?, force? } for staff or partners. First scan starts the trip. */
r.post('/', limits.api, auth.requireStaffOrPartner, U.wrap(async (req, res) => {
  const { code, sig } = parseScan(req.body || {});
  res.set('Cache-Control', 'no-store').json(await trips.checkin({ code, sig, force: !!req.body.force, actor: req.actor }));
}));

module.exports = r;
