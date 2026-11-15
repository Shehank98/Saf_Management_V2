/* Money-flow report: what came in from guests, what went out to partners, and what is left, for any period.
   Builds the numbers from the database, then draws a PDF. Amounts are in LKR (guest USD payments use the rate locked at booking). */
const PDFDocument = require('pdfkit');
const { query } = require('../db');
const U = require('../lib/util');
const serialize = require('../lib/serialize');
const settings = require('../lib/settings');

const money = n => 'LKR ' + Math.round(n).toLocaleString('en-US');
const sgn = n => (n < 0 ? '-' : '') + money(Math.abs(n));
const nice = d => { const [y, m, dd] = d.split('-'); return `${+dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}`; };

async function collect(from, to) {
  const conf = await settings.load(), db = { query };
  const [trips, lines, pays] = await Promise.all([serialize.trips(db, U.addDays(from, -60), conf), serialize.payoutLines(db, U.addDays(from, -60)), serialize.customerPayments(db, from)]);
  const names = Object.fromEntries((await query('SELECT id, name FROM partners')).rows.map(p => [String(p.id), p.name]));
  const inR = d => d >= from && d <= to;
  const when = t => (['Upcoming', 'Cancelled'].includes(t.status) ? (t.bookedOn || t.date) : t.date);
  const T = trips.filter(t => ['Completed', 'Started', 'Cancelled', 'Upcoming'].includes(t.status) && inR(when(t))).sort((a, b) => a.date.localeCompare(b.date));
  const P = pays.filter(p => inR(p.d)).sort((a, b) => a.d.localeCompare(b.d));
  const received = P.filter(p => p.amt > 0 && !p.pendingRefund), refunds = P.filter(p => p.amt < 0 || p.pendingRefund);
  const paidLines = lines.filter(l => l.paid && l.paidAt && inR(l.paidAt));
  const hist = {};
  paidLines.forEach(l => { const h = hist[l.ref] = hist[l.ref] || { ref: l.ref, at: l.paidAt, partner: names[l.vendor] || 'Partner ' + l.vendor, method: l.method, amount: 0, n: 0 }; h.amount += l.amount; h.n++; });
  const payoutsPaid = Object.values(hist).sort((a, b) => a.at.localeCompare(b.at));
  const owedBy = {};
  lines.filter(l => !l.paid).forEach(l => { const o = owedBy[l.vendor] = owedBy[l.vendor] || { partner: names[l.vendor] || 'Partner ' + l.vendor, amount: 0, n: 0 }; o.amount += l.amount; o.n++; });
  const collectRows = (await query(`SELECT code, lead_name, date, total, paid, refunded, fx FROM bookings WHERE status IN ('CONFIRMED','STARTED','REQUEST') AND total > paid ORDER BY date`)).rows
    .map(b => ({ code: b.code, who: b.lead_name, date: b.date, bal: Math.round((b.total - b.paid) * (+b.fx || 1)) }));
  const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
  const cashIn = sum(received, p => p.amt), cashRefund = Math.abs(sum(refunds.filter(p => !p.pendingRefund), p => p.amt)), refundsDue = sum(refunds.filter(p => p.pendingRefund), p => Math.abs(p.amt));
  const cashOut = sum(payoutsPaid, h => h.amount);
  const sales = sum(T, t => t.revenue), cost = sum(T, t => t.cost.total);
  return {
    from, to, business: conf.business, generated: new Date().toISOString(),
    cash: { in: cashIn, refunds: cashRefund, refundsDue, net: cashIn - cashRefund, out: cashOut, left: cashIn - cashRefund - cashOut },
    profit: { sales, cost, profit: sales - cost, trips: T.length },
    owed: Object.values(owedBy).sort((a, b) => b.amount - a.amount), owedTotal: sum(Object.values(owedBy), o => o.amount),
    collect: collectRows, collectTotal: sum(collectRows, c => c.bal),
    trips: T, received, refunds, payoutsPaid,
  };
}

function draw(r, doc) {
  const L = 40, W = doc.page.width - 80, INK = '#1f2a14', MUTED = '#6b6b5e', GREEN = '#3f5b24', RED = '#b3382c', LINE = '#d9d4c3';
  let y;
  const ensure = h => { if (doc.y + h > doc.page.height - 56) { doc.addPage(); doc.y = 46 } };
  const h2 = t => { ensure(60); doc.moveDown(0.8).font('Helvetica-Bold').fontSize(13).fillColor(GREEN).text(t, L, doc.y); doc.moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).strokeColor(LINE).lineWidth(1).stroke(); doc.moveDown(0.5) };
  const note = t => doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(t, L, doc.y, { width: W }).moveDown(0.4);
  // columns: [{h, w (fraction), a: 'right'|'left', k: row => text}]
  const table = (cols, rows, foot) => {
    const widths = cols.map(c => c.w * W), xs = widths.reduce((a, w, i) => (a.push(i ? a[i - 1] + widths[i - 1] : L), a), []);
    const head = () => { ensure(40); const yy = doc.y; doc.rect(L, yy - 2, W, 17).fillColor('#efe9d6').fill(); doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK); cols.forEach((c, i) => doc.text(c.h, xs[i] + 3, yy + 2, { width: widths[i] - 6, align: c.a || 'left', lineBreak: false })); doc.y = yy + 18 };
    head();
    const row = (cells, bold, shade) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
      const hs = cells.map((t, i) => doc.heightOfString(String(t.t ?? t), { width: widths[i] - 6 })), hh = Math.max(...hs) + 6;
      if (doc.y + hh > doc.page.height - 56) { doc.addPage(); doc.y = 46; head(); doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5) }
      const yy = doc.y; if (shade) doc.rect(L, yy - 1, W, hh).fillColor('#f7f4ea').fill();
      cells.forEach((t, i) => doc.fillColor(t.c || INK).text(String(t.t ?? t), xs[i] + 3, yy + 2, { width: widths[i] - 6, align: cols[i].a || 'left' }));
      doc.y = yy + hh; doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor('#ece7d6').lineWidth(.5).stroke(); doc.y += 1;
    };
    rows.forEach((x, i) => row(cols.map(c => c.k(x)), false, i % 2));
    if (foot) row(foot, true);
    doc.moveDown(0.3);
  };
  const kpi = (x, yy, w, label, val, color, sub) => { doc.roundedRect(x, yy, w, 58, 8).fillColor('#faf7ee').fill().roundedRect(x, yy, w, 58, 8).strokeColor(LINE).lineWidth(1).stroke(); doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x + 10, yy + 9, { width: w - 20 }); doc.font('Helvetica-Bold').fontSize(14).fillColor(color || INK).text(val, x + 10, yy + 22, { width: w - 20 }); if (sub) doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(sub, x + 10, yy + 43, { width: w - 20 }) };

  // Header
  doc.rect(0, 0, doc.page.width, 78).fillColor(GREEN).fill();
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#fff').text(r.business.name || 'Yala Wild Safaris', L, 22);
  doc.font('Helvetica').fontSize(11).fillColor('#e6efd8').text(`Money flow report · ${nice(r.from)} to ${nice(r.to)}`, L, 49);
  doc.fillColor(INK); doc.y = 94;
  note(`Generated ${new Date(r.generated).toUTCString().replace(' GMT', ' UTC')}. All amounts in Sri Lankan rupees (LKR). Guest payments made in other currencies use the rate locked when they booked.`);

  // 1. Money flow summary
  h2('1. The money flow at a glance');
  y = doc.y + 2; const kw = (W - 24) / 4;
  kpi(L, y, kw, 'Money received', money(r.cash.in), GREEN, 'card, cash and bank');
  kpi(L + kw + 8, y, kw, 'Refunded to guests', money(r.cash.refunds), r.cash.refunds ? RED : INK, r.cash.refundsDue ? `+ ${money(r.cash.refundsDue)} still to refund` : 'paid out');
  kpi(L + 2 * (kw + 8), y, kw, 'Paid to partners', money(r.cash.out), INK, `${r.payoutsPaid.length} payout${r.payoutsPaid.length === 1 ? '' : 's'}`);
  kpi(L + 3 * (kw + 8), y, kw, 'Cash left', sgn(r.cash.left), r.cash.left < 0 ? RED : GREEN, 'received - refunds - partner pay');
  doc.y = y + 70;
  table([{ h: 'Step', w: .6, k: x => x[0] }, { h: 'Amount', w: .4, a: 'right', k: x => ({ t: x[1], c: x[2] }) }], [
    ['Money received from guests', money(r.cash.in)], ['Minus refunds paid to guests', '- ' + money(r.cash.refunds)], ['= Net money from guests', money(r.cash.net)],
    ['Minus partner payments made', '- ' + money(r.cash.out)], ['= Cash left in the business', sgn(r.cash.left), r.cash.left < 0 ? RED : GREEN]]);
  y = doc.y; ensure(70);
  note('Profit view (trips counted on the day they ran; upcoming paid trips use estimated partner costs; fees kept from cancellations count as income):');
  table([{ h: 'Item', w: .6, k: x => x[0] }, { h: 'Amount', w: .4, a: 'right', k: x => ({ t: x[1], c: x[2] }) }], [
    ['Sales from ' + r.profit.trips + ' trips', money(r.profit.sales)], ['Partner costs (jeeps, trackers, meals, camera)', '- ' + money(r.profit.cost)],
    ['= Profit', sgn(r.profit.profit), r.profit.profit < 0 ? RED : GREEN], ['Margin', r.profit.sales ? Math.round(r.profit.profit / r.profit.sales * 100) + '%' : '-']]);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Still open today', L, doc.y + 2).moveDown(.2);
  table([{ h: 'Item', w: .6, k: x => x[0] }, { h: 'Amount', w: .4, a: 'right', k: x => x[1] }], [
    ['We still owe partners (unpaid trips)', money(r.owedTotal)], ['Guests still to pay (collect at pickup)', money(r.collectTotal)], ['Refunds still to send by hand', money(r.cash.refundsDue)]]);

  // 2. Customer payments
  h2('2. Money received from guests'); 
  table([{ h: 'Date', w: .13, k: x => nice(x.d) }, { h: 'Booking', w: .16, k: x => x.code }, { h: 'Guest', w: .27, k: x => x.who }, { h: 'Type', w: .26, k: x => x.kind }, { h: 'Amount', w: .18, a: 'right', k: x => ({ t: sgn(x.amt), c: x.amt < 0 ? RED : INK }) }],
    r.received.concat(r.refunds).sort((a, b) => a.d.localeCompare(b.d)),
    [{ t: 'Total' }, '', '', '', { t: sgn(r.cash.in - r.cash.refunds - r.cash.refundsDue) }]);
  if (!r.received.length && !r.refunds.length) note('No guest payments in this period.');

  // 3. Partner payments
  h2('3. Payments made to partners');
  if (r.payoutsPaid.length) table([{ h: 'Paid on', w: .16, k: x => nice(x.at) }, { h: 'Reference', w: .2, k: x => x.ref }, { h: 'Partner', w: .26, k: x => x.partner }, { h: 'Method', w: .16, k: x => x.method }, { h: 'Trips', w: .06, a: 'right', k: x => x.n }, { h: 'Amount', w: .16, a: 'right', k: x => money(x.amount) }], r.payoutsPaid, [{ t: 'Total' }, '', '', '', '', { t: money(r.cash.out) }]);
  else note('No partner payments were made in this period.');
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Owed to partners now (not yet paid)', L, doc.y + 4).moveDown(.2);
  if (r.owed.length) table([{ h: 'Partner', w: .6, k: x => x.partner }, { h: 'Unpaid lines', w: .15, a: 'right', k: x => x.n }, { h: 'Owed', w: .25, a: 'right', k: x => money(x.amount) }], r.owed, [{ t: 'Total' }, '', { t: money(r.owedTotal) }]);
  else note('Nothing is owed to partners.');

  // 4. Trips
  h2('4. Profit per trip');
  if (r.trips.length) table([{ h: 'Date', w: .11, k: x => nice(x.date) }, { h: 'Trip', w: .17, k: x => `${x.code}\n${x.kind}${x.est ? ' (est.)' : ''}` }, { h: 'Guests', w: .08, a: 'right', k: x => x.guests }, { h: 'Revenue', w: .15, a: 'right', k: x => money(x.revenue) }, { h: 'Costs', w: .15, a: 'right', k: x => money(x.cost.total) }, { h: 'Profit', w: .17, a: 'right', k: x => ({ t: sgn(x.profit), c: x.profit < 0 ? RED : INK }) }, { h: 'Margin', w: .08, a: 'right', k: x => x.revenue ? Math.round(x.profit / x.revenue * 100) + '%' : '-' }],
    r.trips, [{ t: 'Total' }, '', '', { t: money(r.profit.sales) }, { t: money(r.profit.cost) }, { t: sgn(r.profit.profit) }, '']);
  else note('No trips in this period.');

  // 5. Guests to collect
  h2('5. Guests who still owe money');
  if (r.collect.length) table([{ h: 'Booking', w: .2, k: x => x.code }, { h: 'Guest', w: .4, k: x => x.who }, { h: 'Trip date', w: .2, k: x => nice(x.date) }, { h: 'Balance', w: .2, a: 'right', k: x => money(x.bal) }], r.collect, [{ t: 'Total' }, '', '', { t: money(r.collectTotal) }]);
  else note('No guest balances are outstanding.');

  // Footer with page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) { doc.switchToPage(range.start + i); doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`${r.business.name || ''} · Money flow ${r.from} to ${r.to} · Page ${i + 1} of ${range.count}`, L, doc.page.height - 34, { width: W, align: 'center', lineBreak: false }) }
}

function pdf(r) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Money flow ${r.from} to ${r.to}`, Author: r.business.name || 'Yala Wild Safaris' } });
  draw(r, doc); doc.end(); return doc;
}
module.exports = { collect, pdf };
