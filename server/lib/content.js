/* Website text the office can change (Admin → Website text). Only the changed fields are stored; everything else keeps the text that is in the page. */
const FIELDS = require('./content-fields');
const BY = Object.fromEntries(FIELDS.map(f => [f.key, f]));

/** Keep only known fields whose text really differs from the default. Empty = back to the default. */
function clean(input) {
  const out = {};
  for (const [k, raw] of Object.entries(input && typeof input === 'object' ? input : {})) {
    const f = BY[k]; if (!f || typeof raw !== 'string') continue;
    let v = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\r\n?/g, '\n');
    v = f.key === 'incl.list' ? v.split('\n').map(x => x.trim()).filter(Boolean).join('\n') : v.replace(/\s*\n\s*/g, ' ').trim();
    v = v.slice(0, f.long ? 700 : 160);
    if (v && v !== f.def) out[k] = v;
  }
  return out;
}

/** Replace {tokens} with real values. Unknown tokens stay as they are. */
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));

/** The text for a field: the office's version, or the default. */
const text = (conf, key, vars) => fill((conf.content && conf.content[key]) || (BY[key] && BY[key].def) || '', vars);

module.exports = { FIELDS, BY, clean, fill, text };
