/* Nicer dropdowns for the guest website. Each <select> keeps working underneath (forms, values and
   change events are unchanged); a styled button and option list sit on top of it.
   Phones get a bottom sheet. Keyboard: Enter / Space / arrows / Esc / type a letter.
   Opt out with <select data-native>. */
(function () {
  const ARROW = '<svg class="fs-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const TICK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  let uid = 0, openOne = null;
  const mobile = () => matchMedia('(max-width: 600px)').matches;
  const labelFor = sel => {
    if (sel.id) { const l = document.querySelector(`label[for="${CSS.escape(sel.id)}"]`); if (l) return l.textContent.trim() }
    const wrap = sel.closest('label'); if (wrap) { const sp = wrap.querySelector('span'); if (sp) return sp.textContent.trim() }
    return sel.getAttribute('aria-label') || 'Choose';
  };

  function enhance(sel) {
    if (sel.dataset.fs || sel.dataset.native !== undefined || sel.multiple) return;
    sel.dataset.fs = '1';
    const id = 'fs' + (++uid);
    const box = document.createElement('div'); box.className = 'fs';
    const btn = document.createElement('button'); btn.type = 'button';
    btn.className = 'fs-btn ' + (sel.className || '');
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);
    const list = document.createElement('div'); list.className = 'fs-list'; list.id = id; list.setAttribute('role', 'listbox'); list.tabIndex = -1;
    sel.parentNode.insertBefore(box, sel); box.appendChild(sel); box.appendChild(btn); box.appendChild(list);
    sel.classList.add('fs-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    let active = -1;
    const lab = sel.closest('label');

    const opts = () => [...sel.options];
    const paintBtn = () => {
      const o = sel.options[sel.selectedIndex];
      btn.innerHTML = `<span class="fs-val">${o ? escH(o.textContent) : ''}</span>${ARROW}`;
      btn.disabled = sel.disabled;
      btn.setAttribute('aria-label', `${labelFor(sel)}: ${o ? o.textContent : ''}`);
    };
    const paintList = () => {
      list.innerHTML = (mobile() ? `<div class="fs-head"><b>${escH(labelFor(sel))}</b><button type="button" class="fs-x" aria-label="Close">×</button></div>` : '') +
        opts().map((o, i) => `<div class="fs-opt ${i === sel.selectedIndex ? 'on' : ''} ${o.disabled ? 'dis' : ''}" role="option" id="${id}-${i}" data-i="${i}" aria-selected="${i === sel.selectedIndex}">${escH(o.textContent)}<span class="fs-tick">${TICK}</span></div>`).join('');
      const x = list.querySelector('.fs-x'); if (x) x.onclick = () => close(true);
    };
    const setActive = i => {
      const n = opts().length; if (!n) return;
      active = Math.max(0, Math.min(n - 1, i));
      list.querySelectorAll('.fs-opt').forEach((el, k) => el.classList.toggle('act', k === active));
      const el = list.querySelector(`[data-i="${active}"]`); if (el) { el.scrollIntoView({ block: 'nearest' }); btn.setAttribute('aria-activedescendant', el.id) }
    };
    const choose = i => {
      const o = sel.options[i]; if (!o || o.disabled) return;
      if (sel.selectedIndex !== i) { sel.selectedIndex = i; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })) }
      paintBtn(); close(true);
    };
    function open() {
      if (btn.disabled) return;
      if (openOne && openOne !== close) openOne();
      paintList(); box.classList.add('open'); list.classList.add('show'); btn.setAttribute('aria-expanded', 'true');
      // Phones: the list becomes a bottom sheet at the top level of the page, above everything else.
      if (mobile()) { document.body.appendChild(list); list.classList.add('sheet'); document.body.classList.add('fs-lock'); backdrop(true, () => close(true)) }
      else { const r = btn.getBoundingClientRect(); box.classList.toggle('up', innerHeight - r.bottom < 260 && r.top > 260) }
      setActive(sel.selectedIndex < 0 ? 0 : sel.selectedIndex); openOne = close;
      if (document.activeElement !== btn) btn.focus({ preventScroll: true });
    }
    function close(focus) {
      if (!box.classList.contains('open')) return;
      box.classList.remove('open', 'up'); list.classList.remove('show', 'sheet'); if (list.parentNode !== box) box.appendChild(list); btn.setAttribute('aria-expanded', 'false'); btn.removeAttribute('aria-activedescendant');
      document.body.classList.remove('fs-lock'); backdrop(false); if (openOne === close) openOne = null;
      if (focus) btn.focus({ preventScroll: true });
    }
    btn.addEventListener('click', () => box.classList.contains('open') ? close(true) : open());
    list.addEventListener('click', e => { const o = e.target.closest('.fs-opt'); if (o) choose(+o.dataset.i) });
    list.addEventListener('mousemove', e => { const o = e.target.closest('.fs-opt'); if (o && +o.dataset.i !== active) setActive(+o.dataset.i) });
    let typed = '', typedAt = 0;
    btn.addEventListener('keydown', e => {
      const isOpen = box.classList.contains('open');
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && !isOpen) { e.preventDefault(); open(); return }
      if (!isOpen) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1) }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
      else if (e.key === 'End') { e.preventDefault(); setActive(opts().length - 1) }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active) }
      else if (e.key === 'Escape' || e.key === 'Tab') close(e.key === 'Escape');
      else if (e.key.length === 1) {
        typed = (Date.now() - typedAt > 700 ? '' : typed) + e.key.toLowerCase(); typedAt = Date.now();
        const k = opts().findIndex(o => o.textContent.trim().toLowerCase().startsWith(typed)); if (k >= 0) setActive(k);
      }
    });
    document.addEventListener('click', e => { if (!box.contains(e.target) && !list.contains(e.target) && !(lab && lab.contains(e.target)) && !(e.target.classList && e.target.classList.contains('fs-backdrop'))) close(false) });
    // The page may change the options or the value from code: keep the button in step.
    new MutationObserver(() => { paintBtn(); if (box.classList.contains('open')) paintList() }).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    sel.addEventListener('change', paintBtn);
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(sel, 'value', { get() { return desc.get.call(this) }, set(v) { desc.set.call(this, v); paintBtn() }, configurable: true });
    // Tapping the field's label opens this dropdown (not the plain browser one underneath).
    if (lab) lab.addEventListener('click', e => { if (!box.contains(e.target)) { e.preventDefault(); btn.click() } });
    paintBtn();
  }
  function backdrop(on, onClick) {
    let b = document.querySelector('.fs-backdrop');
    if (on) { if (!b) { b = document.createElement('div'); b.className = 'fs-backdrop'; document.body.appendChild(b) } b.onclick = onClick; b.dataset.on = '1'; requestAnimationFrame(() => { if (b.dataset.on === '1') b.classList.add('show') }) }
    else if (b) { b.dataset.on = ''; b.classList.remove('show') }
  }
  const escH = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const scan = root => (root.querySelectorAll ? root.querySelectorAll('select') : []).forEach(enhance);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openOne) openOne(true) });
  const start = () => { scan(document); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.tagName === 'SELECT') enhance(n); else scan(n) } }))).observe(document.body, { childList: true, subtree: true }) };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  window.fancySelect = enhance;
})();
