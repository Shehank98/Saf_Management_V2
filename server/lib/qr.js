const QRCode = require('qrcode');
const secrets = require('./secrets');

/** The link inside every e-ticket QR: signed so it can't be guessed. */
const ticketLink = (base, code) => `${base}/t/${encodeURIComponent(code)}?k=${secrets.sign(code)}`;
const png = text => QRCode.toBuffer(text, { type: 'png', width: 360, margin: 1, errorCorrectionLevel: 'M' });
const pngBase64 = async text => (await png(text)).toString('base64');

module.exports = { ticketLink, png, pngBase64 };
