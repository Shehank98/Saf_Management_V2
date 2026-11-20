adminShell({ active: 'content.html', title: 'Website text' });
const TABS = [['home', 'Home page'], ['date', 'Date & park pages']];
let FIELDS = [], saved = {}, vals = {}, PARKS = [], tab = 'home', query = '', park = '', ready = false;
const frame = $('#pv');
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const same = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]) };
const dirty = () => !same(vals, saved);
const norm = (k, v) => { const f = FIELDS.find(x => x.key === k); return f && f.key === 'incl.list' ? v.split('\n').map(x => x.trim()).filter(Boolean).join('\n') : v.replace(/\s*\n\s*/g, ' ').trim() };

/* ---- preview on the left ---- */
const previewUrl = (forEdit = true) => {
  const q = new URLSearchParams(); if (tab === 'date' && park) q.set('loc', park); if (forEdit) q.set('preview', '1');
  return (tab === 'home' ? '/safari' : '/shared') + (q.toString() ? '?' + q : '');
};
function loadPreview() { ready = false; const u = previewUrl(); if (frame.getAttribute('src') !== u) frame.src = u; $('#openPg').href = previewUrl(false) }
let pending = 0;
function pushDraft() { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => { try { frame.contentWindow.postMessage({ type: 'content-draft', values: vals }, location.origin) } catch (e) { } }) }
frame.addEventListener('load', () => { pushDraft(); setTimeout(pushDraft, 500) });
addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || e.source !== frame.contentWindow) return;
  if (e.data.type === 'content-ready') { ready = true; pushDraft() }
  if (e.data.type === 'content-pick') pick(e.data.key);
});

/* ---- editor on the right ---- */
function renderTabs() {
  $('#ctabs').innerHTML = TABS.map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('') + `<input type="search" id="cq" placeholder="Search text…" value="${esc(query)}" aria-label="Search text">`;
  $$('#ctabs [data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; query = ''; renderTabs(); renderForm(); setupPark(); loadPreview() });
  $('#cq').oninput = e => { query = e.target.value.toLowerCase(); renderForm() };
}
function setupPark() {
  const sel = $('#park'); sel.hidden = !(tab === 'date' && PARKS.length > 1);
  sel.innerHTML = PARKS.map(p => `<option value="${esc(p.id)}" ${p.id === park ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  sel.onchange = () => { park = sel.value; loadPreview() };
}
function renderForm() {
  const list = FIELDS.filter(f => f.page === tab && (!query || (f.label + ' ' + f.def + ' ' + f.key + ' ' + f.group + ' ' + (vals[f.key] || '')).toLowerCase().includes(query)));
  const groups = []; list.forEach(f => { let g = groups.find(x => x.name === f.group); if (!g) groups.push(g = { name: f.group, items: [] }); g.items.push(f) });
  $('#cform').innerHTML = groups.map((g, i) => {
    const n = g.items.filter(f => vals[f.key] !== undefined).length;
    return `<details class="cgroup" ${i === 0 || query ? 'open' : ''}><summary><span>${esc(g.name)}</span><span class="n">${n ? `<b>${n} changed</b> · ` : ''}${g.items.length} text${g.items.length === 1 ? '' : 's'}</span></summary>${g.items.map(fieldHTML).join('')}</details>`;
  }).join('') || '<div class="empty" style="padding:30px 10px">Nothing matches your search.</div>';
  $$('#cform textarea').forEach(t => { fit(t); t.oninput = () => { fit(t); setVal(t.dataset.k, t.value, t) }; });
  $$('#cform [data-reset]').forEach(a => a.onclick = () => { const k = a.dataset.reset, f = FIELDS.find(x => x.key === k); delete vals[k]; const t = $(`#cform textarea[data-k="${CSS.escape(k)}"]`); t.value = f.def; fit(t); mark(t.closest('.cfield'), k); pushDraft(); status() });
  status();
}
function fieldHTML(f) {
  const v = vals[f.key] !== undefined ? vals[f.key] : f.def, rows = f.key === 'incl.list' ? 7 : f.long ? 3 : 1;
  return `<div class="cfield ${vals[f.key] !== undefined ? 'changed' : ''}" data-f="${esc(f.key)}"><label for="f_${esc(f.key)}">${esc(f.label)}<small>${f.long ? 'longer text' : 'short text'}</small></label>
    <textarea id="f_${esc(f.key)}" data-k="${esc(f.key)}" rows="${rows}" maxlength="${f.long ? 700 : 160}">${esc(v)}</textarea>
    <div class="meta"><span>${f.tokens ? `You can use ${f.tokens.split(' ').map(t => `<span class="tk">${esc(t)}</span>`).join(' ')}` : ''}</span>${vals[f.key] !== undefined ? `<a data-reset="${esc(f.key)}">Reset to original</a>` : ''}</div></div>`;
}
const fit = t => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 320) + 'px' };
function setVal(k, text, ta) {
  const f = FIELDS.find(x => x.key === k), v = norm(k, text);
  if (!v || v === f.def) delete vals[k]; else vals[k] = text;
  mark(ta.closest('.cfield'), k); pushDraft(); status();
}
function mark(box, k) {
  box.classList.toggle('changed', vals[k] !== undefined);
  const meta = box.querySelector('.meta'), has = meta.querySelector('[data-reset]');
  if (vals[k] !== undefined && !has) { meta.insertAdjacentHTML('beforeend', `<a data-reset="${esc(k)}">Reset to original</a>`); meta.querySelector('[data-reset]').onclick = () => { const f = FIELDS.find(x => x.key === k); delete vals[k]; const t = box.querySelector('textarea'); t.value = f.def; fit(t); mark(box, k); pushDraft(); status() } }
  if (vals[k] === undefined && has) has.remove();
  const g = box.closest('.cgroup'); if (g) { const n = qa('.cfield.changed', g).length, total = qa('.cfield', g).length; g.querySelector('.n').innerHTML = `${n ? `<b>${n} changed</b> · ` : ''}${total} text${total === 1 ? '' : 's'}` }
}
function status() {
  const d = dirty(), n = Object.keys(vals).length;
  $('#cst').className = 'st' + (d ? ' dirty' : ''); $('#cst').textContent = d ? 'Unsaved changes · only you can see them' : n ? `Saved · ${n} text${n === 1 ? '' : 's'} changed from the original` : 'No changes';
  $('#save').disabled = !d; $('#discard').disabled = !d;
}
/* clicking a text in the preview jumps to its field */
function pick(k) {
  const f = FIELDS.find(x => x.key === k); if (!f) return;
  $('#cw').dataset.m = 'edit'; $$('#cmode button').forEach(b => b.classList.toggle('on', b.dataset.m === 'edit'));
  const go = () => { query = ''; renderTabs(); renderForm(); const box = $(`.cfield[data-f="${CSS.escape(k)}"]`); if (!box) return; const g = box.closest('details'); if (g) g.open = true; box.scrollIntoView({ block: 'center', behavior: 'smooth' }); box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); const t = box.querySelector('textarea'); t.focus({ preventScroll: true }); t.select() };
  if (f.page !== tab) { tab = f.page; setupPark(); loadPreview(); frame.addEventListener('load', () => setTimeout(() => { try { frame.contentWindow.postMessage({ type: 'content-focus', key: k }, location.origin) } catch (e) { } }, 600), { once: true }) }
  go();
}
/* ---- save / undo ---- */
$('#save').onclick = e => busy(e.target, async () => {
  const r = await PUT('/api/admin/content', { values: vals });
  saved = { ...r.values }; vals = { ...r.values }; renderForm(); pushDraft(); toast('Saved · the website now shows your text');
});
$('#discard').onclick = () => { vals = { ...saved }; renderForm(); pushDraft() };
addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = '' } });
/* ---- phone / desktop preview, and the edit / preview switch on small screens ---- */
$('#devD').onclick = () => { $('#stage').classList.remove('phone'); $('#devD').classList.add('on'); $('#devP').classList.remove('on') };
$('#devP').onclick = () => { $('#stage').classList.add('phone'); $('#devP').classList.add('on'); $('#devD').classList.remove('on') };
$$('#cmode button').forEach(b => b.onclick = () => { $('#cw').dataset.m = b.dataset.m; $$('#cmode button').forEach(x => x.classList.toggle('on', x === b)); if (b.dataset.m === 'view') pushDraft() });
(async () => {
  try { const d = await GET('/api/admin/content'); FIELDS = d.fields; saved = { ...d.values }; vals = { ...d.values }; PARKS = d.parks; park = (PARKS[0] || {}).id || '' } catch (e) { return toastErr(e) }
  renderTabs(); renderForm(); setupPark(); loadPreview();
})();
