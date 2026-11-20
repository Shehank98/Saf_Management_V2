/* Search-engine pages: every park has its own "choose your date" page (/shared?loc=yala) with its own
   title, description, structured data and readable text, so people who search for that park land on it. */
const U = require('./util');
const content = require('./content');
const settings = require('./settings');

const esc = U.esc;
const lkr = n => 'LKR ' + Math.round(n).toLocaleString('en-US');

/** The parks that are open for booking. */
const openParks = conf => conf.locList.map(id => conf.locations[id]).filter(l => l && l.active);

/** The sessions of a park that guests can book, in the order Settings lists them. */
const parkSessions = l => Object.values(l.sessions || {}).filter(s => s.active);
const fromPrice = l => Math.min(...parkSessions(l).map(s => s.seat).filter(n => n > 0), Infinity);

function parkSeo(conf, l, base) {
  const brand = conf.business.name || 'Safari', ses = parkSessions(l), from = fromPrice(l), url = `${base}/shared?loc=${encodeURIComponent(l.id)}`;
  const minSeats = conf.shared.minSeats, hours = conf.shared.autoCancelH;
  const title = `${l.name} Safari · Book a Shared Jeep Seat | ${brand}`;
  const desc = `Book a seat on a shared jeep safari in ${l.name}.${ses.length ? ' ' + ses.map(s => s.short).join(', ') + ' sessions' : ''}${Number.isFinite(from) ? `, from ${lkr(from)} per seat` : ''}. Free hotel pickup within ${l.radiusKm} km. Full refund if the jeep does not run.`.slice(0, 300);
  const faq = [
    [`How much is a ${l.name} safari?`, Number.isFinite(from) ? `A seat on a shared jeep starts from ${lkr(from)}. ${ses.map(s => `${s.name} (${s.time}) is ${lkr(s.seat)} per seat`).join('; ')}.` : 'Prices are shown for each date when you choose it.'],
    ['What happens if not enough people book?', `A shared jeep goes ahead once ${minSeats} seats are paid. If it does not reach that, it is cancelled about ${hours} hours before the start and every guest gets a full refund.`],
    ['Is hotel pickup included?', `Yes. We pick you up free from your hotel within ${l.radiusKm} km of our base${l.office ? ' (' + l.office + ')' : ''}. If you stay further away you can meet us at the office.`],
    ['Can I choose my seat?', 'Yes. You pick your exact seat on a live seat map. The seat is held for you while you book.'],
    ['How do I get my ticket?', 'You receive a QR e-ticket by email as soon as the jeep is confirmed. Show it to your driver at pickup.'],
  ];
  const ld = [
    { '@context': 'https://schema.org', '@type': 'TouristTrip', name: `${l.name} shared jeep safari`, description: desc, touristType: 'Wildlife safari', url,
      provider: { '@type': 'TravelAgency', name: brand, url: base, telephone: conf.business.phone || undefined, address: conf.business.office || undefined },
      ...(Number.isFinite(from) ? { offers: { '@type': 'Offer', priceCurrency: 'LKR', price: String(from), url, availability: 'https://schema.org/InStock' } } : {}) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: brand, item: base + '/' }, { '@type': 'ListItem', position: 2, name: `${l.name} safari`, item: url }] },
  ];
  const head = `<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}`;
  const body = `<section class="seo" aria-labelledby="seoh">
  <h2 id="seoh" data-c="park.h2">${esc(content.text(conf, 'park.h2', { park: l.name, brand }))}</h2>
  <p data-c="park.intro">${esc(content.text(conf, 'park.intro', { park: l.name, brand, tagline: String(l.tagline || `Join a small group in an open 4×4 jeep and look for wildlife in ${l.name}`).replace(/[.\s]+$/, '') }))}</p>
  ${ses.length ? `<h3>Sessions in ${esc(l.name)}</h3><ul class="seolist">${ses.map(s => `<li><b>${esc(s.name)}</b> · ${esc(s.time)} · pickup from ${esc(s.pickup)} · ${lkr(s.seat)} per seat</li>`).join('')}</ul>` : ''}
  <h3>Good to know</h3>
  <ul class="seolist"><li>Free hotel pickup within ${l.radiusKm} km${l.office ? `, or meet us at ${esc(l.office)}` : ''}.</li><li>A shared jeep goes ahead once ${minSeats} seats are paid. If not, you get a full refund.</li><li>Seats are held for you while you book.</li></ul>
  <h3>Questions</h3>${faq.map(([q, a]) => `<details class="seofaq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
</section>`;
  return { title, head, body, desc, url, name: l.name };
}

function sitemap(conf, base) {
  const urls = [['/', '1.0'], ...openParks(conf).map(l => [`/shared?loc=${encodeURIComponent(l.id)}`, '0.9'])];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, p]) => `  <url><loc>${esc(base + u)}</loc><priority>${p}</priority></url>`).join('\n')}\n</urlset>\n`;
}

module.exports = { parkSeo, sitemap, openParks };
