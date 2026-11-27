/* Vitrine : recherche/filtres, disponibilité en direct, panier « demande WhatsApp » */
(function () {
  const V = window.VITRINE || {};
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const waHref = t => 'https://wa.me/' + V.wa + '?text=' + encodeURIComponent(t);

  /* ---------- Toast ---------- */
  let tt;
  function toast(msg, act) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg;
    if (act) { const b = document.createElement('button'); b.type = 'button'; b.textContent = act.label; b.onclick = () => { t.hidden = true; act.fn(); }; t.append(b); }
    t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, act ? 4500 : 2500);
  }

  /* ---------- Panier (gardé sur ce téléphone) ---------- */
  const KEY = 'stoufa-demande';
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { cart = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} };
  let nameV = ''; try { nameV = localStorage.getItem(KEY + '-nom') || ''; } catch (e) {}

  function infoOf(id) {
    const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!el) return null;
    const img = el.querySelector('img');
    return { id, nom: el.dataset.nom, img: img ? img.getAttribute('src') : '', promo: el.dataset.promo || '' };
  }
  function add(id, q) {
    const it = cart.find(x => x.id === id);
    if (it) it.q += q; else { const i = infoOf(id); if (!i) return; cart.push({ ...i, q }); }
    save(); paint();
    const nom = (cart.find(x => x.id === id) || {}).nom || 'Pièce';
    toast(nom + ' ajoutée', { label: 'Voir ma demande', fn: openCart });
  }
  function paint() {
    const n = cart.reduce((s, x) => s + x.q, 0);
    const b = $('#cartN'); if (b) { b.textContent = n; b.hidden = !n; }
    $$('[data-add]').forEach(btn => { if (btn.classList.contains('add')) btn.classList.toggle('done', cart.some(x => x.id === btn.dataset.add)); });
    const l = $('#cartList'); if (!l) return;
    if (!cart.length) l.innerHTML = '<li class="cart-empty" style="display:block;border:0">Votre demande est vide. Ajoutez des pièces avec le bouton +.</li>';
    else l.innerHTML = cart.map(x => `<li><span>${x.img ? `<img src="${x.img.replace(/"/g, '&quot;')}" alt="">` : '<span class="ph" style="display:block"></span>'}</span>
      <div><div class="nm"></div><button class="rm" type="button" data-rm="${x.id}">Retirer</button></div>
      <div class="mini"><button type="button" data-q="${x.id}" data-d="-1" aria-label="Une de moins">−</button><span>${x.q}</span><button type="button" data-q="${x.id}" data-d="1" aria-label="Une de plus">+</button></div></li>`).join('');
    l.querySelectorAll('.nm').forEach((el, i) => el.textContent = cart[i].nom);
    l.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { cart = cart.filter(x => x.id !== b.dataset.rm); save(); paint(); });
    l.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const it = cart.find(x => x.id === b.dataset.q); if (!it) return; it.q = Math.max(1, it.q + Number(b.dataset.d)); save(); paint(); });
    updSend();
  }
  function updSend() {
    const s = $('#cartSend'); if (!s) return;
    const nom = ($('#cartName') && $('#cartName').value.trim()) || '';
    const lines = cart.map(x => `• ${x.q} × ${x.nom}${x.promo ? ' (promo −' + x.promo + ' %)' : ''}`).join('\n');
    s.href = waHref(`Bonjour${nom ? ', c\'est ' + nom : ''}. Je souhaite réserver ces pièces (retrait en boutique) :\n${lines}\nMerci de me confirmer la disponibilité et le prix.`);
    s.setAttribute('aria-disabled', cart.length && V.wa ? 'false' : 'true');
  }
  function openCart() { const d = $('#drawer'); if (!d) return; const t = $('#toast'); if (t) t.hidden = true; d.hidden = false; paint(); setTimeout(() => { const x = $('#drawerX'); if (x) x.focus(); }, 30); }
  function closeCart() { const d = $('#drawer'); if (d) d.hidden = true; }
  const cb = $('#cartBtn'); if (cb) cb.onclick = openCart;
  const dx = $('#drawerX'); if (dx) dx.onclick = closeCart;
  const dr = $('#drawer'); if (dr) dr.addEventListener('click', e => { if (e.target === dr) closeCart(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });
  const cn = $('#cartName'); if (cn) { cn.value = nameV; cn.addEventListener('input', () => { try { localStorage.setItem(KEY + '-nom', cn.value); } catch (e) {} updSend(); }); }
  const cs = $('#cartSend'); if (cs) cs.addEventListener('click', () => { if (cart.length) setTimeout(() => toast('Demande ouverte dans WhatsApp. Pensez à l\'envoyer !'), 300); });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    e.preventDefault();
    let q = 1; if (b.dataset.qty) { const i = $(b.dataset.qty); q = Math.max(1, parseInt(i && i.value, 10) || 1); }
    add(b.dataset.add, q);
  });
  $$('[data-step]').forEach(b => b.onclick = () => { const i = $('#qty'); i.value = Math.max(1, (parseInt(i.value, 10) || 1) + Number(b.dataset.step)); });
  const qi = $('#qty'); if (qi) qi.addEventListener('input', () => { qi.value = qi.value.replace(/\D/g, ''); });
  paint();

  /* ---------- Recherche et filtres ---------- */
  const grid = $('#grid');
  if (grid) {
    const cards = [...grid.querySelectorAll('.card')];
    let f = 'tout', q = '';
    const stem = w => w.length > 4 ? w.replace(/(es|s|x)$/, '') : w;
    const pass = c => {
      if (f === 'dispo') return c.dataset.dispo === '1';
      if (f === 'promo') return !!c.dataset.promo;
      if (f === 'velo') return c.dataset.cat === 'velo';
      if (f !== 'tout') return c.dataset.cat === 'moto' && (!c.dataset.mod || c.dataset.mod.split(' ').includes(f));
      return true;
    };
    const apply = () => {
      const ts = norm(q).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
      let n = 0;
      cards.forEach(c => {
        const s = c.dataset.s, ws = s.split(/[^a-z0-9]+/);
        const ok = pass(c) && ts.every(t => s.includes(t) || ws.some(w => stem(w) === stem(t) || w.startsWith(stem(t))));
        c.hidden = !ok; if (ok) n++;
      });
      const cnt = $('#count'); if (cnt) cnt.textContent = n + ' pièce' + (n > 1 ? 's' : '') + (q.trim() ? ' pour « ' + q.trim() + ' »' : '');
      const em = $('#empty'); if (em) em.hidden = n > 0;
      const ew = $('#emptyWa'); if (ew) ew.href = waHref('Bonjour, avez-vous cette pièce : ' + (q.trim() || '') + ' ?');
    };
    const qe = $('#q'); if (qe) qe.addEventListener('input', () => { q = qe.value; apply(); });
    $$('.chip[data-f]').forEach(b => b.onclick = () => { f = b.dataset.f; $$('.chip[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b)); apply(); });
  }

  /* ---------- Disponibilité en direct (la page est régénérée chaque nuit) ---------- */
  if (V.api && V.key) {
    fetch(V.api + '/rest/v1/catalogue?select=*', { headers: { apikey: V.key } })
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        list = Array.isArray(list) ? list : [];
        const m = new Map(list.map(x => [x.id, x.disponible]));
        $$('.card[data-id]').forEach(c => {
          if (!m.has(c.dataset.id)) return;
          const d = m.get(c.dataset.id); c.dataset.dispo = d ? 1 : 0;
          const b = c.querySelector('.dispo'); if (b) { b.className = 'dispo ' + (d ? 'ok' : 'cmd'); b.textContent = d ? 'Disponible' : 'Sur commande'; }
        });
        // Promo arrêtée depuis la dernière génération de la page : on retire le badge
        if (list.length && 'promo_pct' in list[0]) {
          const pr = new Map(list.map(x => [x.id, x.promo_pct]));
          $$('[data-promo]').forEach(c => { if (!c.dataset.promo || !pr.has(c.dataset.id) || pr.get(c.dataset.id)) return;
            c.dataset.promo = ''; c.querySelectorAll('.promo-badge,.promo-line').forEach(x => x.remove()); const pb = c.querySelector('.promo-box'); if (pb) pb.remove(); });
        }
        const p = $('.prod[data-id]'), bb = $('[data-dispo-badge]');
        if (p && bb && m.has(p.dataset.id)) { const d = m.get(p.dataset.id); bb.className = 'dispo big ' + (d ? 'ok' : 'cmd'); bb.textContent = d ? 'Disponible en boutique' : 'Sur commande'; }
      }).catch(() => {});
  }
})();
