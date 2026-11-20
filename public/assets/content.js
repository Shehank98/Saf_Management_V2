/* Website text: swaps in the wording the office saved (Admin → Website text).
   Elements marked data-c="key" show the saved text; anything not changed keeps the text that is already in the page.
   Inside the admin preview (?preview=1) the page also takes live drafts and lets the office click a text to edit it. */
(function () {
  const q = new URLSearchParams(location.search);
  const PREVIEW = q.get('preview') === '1' && window.parent !== window;
  let draft = null;
  // CFG is a plain top-level constant of core.js, not a window property
  const cfg = () => (typeof CFG !== 'undefined' ? CFG : {});
  const src = () => draft || cfg().content || {};
  const has = k => Object.prototype.hasOwnProperty.call(src(), k);
  function vars(extra) {
    const C = cfg(), locs = C.locations || [], loc = locs.find(l => l.id === q.get('loc')) || locs.find(l => l.id === C.defaultLoc) || locs[0] || {};
    return { minSeats: C.minSeats, sharedSeats: C.sharedSeats, seats: C.sharedSeats, payWindowH: C.payWindowH, brand: C.brand, park: loc.name || '', tagline: String(loc.tagline || '').replace(/[.\s]+$/, ''), km: loc.radiusKm != null ? loc.radiusKm : C.radiusKm, ...extra };
  }
  const tok = (s, extra) => String(s).replace(/\{(\w+)\}/g, (m, k) => { const v = vars(extra)[k]; return v != null && v !== '' ? v : m });
  const first = new WeakMap();
  function apply() {
    document.querySelectorAll('[data-c]').forEach(el => {
      if (!first.has(el)) first.set(el, el.textContent);
      const k = el.dataset.c, t = has(k) ? tok(src()[k]) : first.get(el);
      if (el.textContent !== t) el.textContent = t;
    });
    document.dispatchEvent(new Event('content-applied'));
  }
  /* For text a page builds with script: returns the saved wording, or undefined when it was not changed. */
  window.C = (key, extra) => (has(key) ? tok(src()[key], extra) : undefined);
  window.contentApply = apply;

  if (PREVIEW) {
    const st = document.createElement('style');
    st.textContent = '[data-c]{cursor:pointer;transition:background .15s,outline-color .15s;outline:2px dashed transparent;outline-offset:3px;border-radius:4px}[data-c]:hover{outline-color:#c0682a;background:rgba(192,104,42,.14)!important}[data-c].c-flash{outline:3px solid #c0682a;outline-offset:3px;background:rgba(192,104,42,.2)!important}*{scroll-behavior:auto!important}.rv{opacity:1!important;transform:none!important}';
    document.head.appendChild(st);
    document.addEventListener('click', e => {
      const el = e.target.closest && e.target.closest('[data-c]');
      if (el) { e.preventDefault(); e.stopPropagation(); parent.postMessage({ type: 'content-pick', key: el.dataset.c }, location.origin); return }
      const a = e.target.closest && e.target.closest('a'); if (a) e.preventDefault();
    }, true);
    document.addEventListener('submit', e => e.preventDefault(), true);
    addEventListener('message', e => {
      if (e.origin !== location.origin || !e.data) return;
      if (e.data.type === 'content-draft') { draft = e.data.values || {}; apply() }
      if (e.data.type === 'content-focus') {
        const el = document.querySelector(`[data-c="${CSS.escape(e.data.key)}"]`);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('c-flash'); setTimeout(() => el.classList.remove('c-flash'), 1600) }
      }
    });
    const ready = () => parent.postMessage({ type: 'content-ready', keys: [...new Set([...document.querySelectorAll('[data-c]')].map(x => x.dataset.c))] }, location.origin);
    addEventListener('load', () => setTimeout(ready, 400));
  }
  const start = () => { apply() };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  // the page may finish setting itself up after this file loads
  addEventListener('load', () => setTimeout(apply, 50));
})();
