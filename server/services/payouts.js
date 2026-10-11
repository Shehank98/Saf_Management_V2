const { tx } = require('../db');
const T = require('../lib/emailTemplates');
const activity = require('../lib/activity');
const notify = require('./notify');
const U = require('../lib/util');

const METHOD = { 'Bank transfer': 'BANK', Cash: 'CASH', Cheque: 'CHEQUE' };
const METHOD_LABEL = { BANK: 'bank transfer', CASH: 'cash', CHEQUE: 'cheque' };

/** Pay selected unpaid lines to one partner: one Payout row, lines marked PAID, statement emailed. */
async function pay({ partnerId, lineIds, method, reference }, actor) {
  const m = METHOD[method] || 'BANK';
  const ref = String(reference || '').trim().slice(0, 40);
  if (!ref) throw U.bad('Enter a reference.');
  if (!Array.isArray(lineIds) || !lineIds.length) throw U.bad('Tick at least one trip.');
  return tx(async db => {
    const p = (await db.query('SELECT * FROM partners WHERE id=$1', [partnerId])).rows[0];
    if (!p) throw U.notFound('Partner not found');
    const lines = (await db.query(`SELECT * FROM payout_lines WHERE id = ANY($1) AND partner_id=$2 AND status='UNPAID' FOR UPDATE`, [lineIds.map(Number), partnerId])).rows;
    if (lines.length !== lineIds.length) throw U.conflict('Some of those lines were already paid. Please reload.');
    const amount = lines.reduce((a, l) => a + l.amount, 0);
    const po = (await db.query(`INSERT INTO payouts(partner_id, reference, method, amount, created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`, [partnerId, ref, m, amount, actor])).rows[0];
    await db.query(`UPDATE payout_lines SET status='PAID', payout_id=$2 WHERE id = ANY($1)`, [lines.map(l => l.id), po.id]);
    await activity.log(db, 'partner', partnerId, `Paid ${U.fmtLkr(amount)} (${ref}, ${METHOD_LABEL[m]}) for ${lines.length} line(s)`, actor);
    const c = await notify.ctx();
    const bankText = p.bank_name ? `${p.bank_name} ••••${String(p.account_no || '').slice(-4)}` : '';
    await notify.send(db, 'vendor_payout', T.vendor_payout({ partner: p, payout: { ...po, methodLabel: METHOD_LABEL[m] }, lines: lines.map(l => ({ date: l.trip_date, code: l.trip_code, amount: l.amount })), bankText: m === 'BANK' ? bankText : '' }, c), { to: p.email, entity: 'partner', entityId: p.id });
    return po;
  });
}

module.exports = { pay, METHOD_LABEL };
