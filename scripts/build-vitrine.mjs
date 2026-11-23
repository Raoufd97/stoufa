// Génère la vitrine statique à partir du catalogue Supabase :
//   index.html (accueil), pieces/<slug>/ (une page par pièce), categorie/<k>/, sitemap.xml
// Lancé chaque nuit par .github/workflows/vitrine.yml, ou à la main : node scripts/build-vitrine.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(ROOT, 'config.js'), 'utf8'), sandbox);
const CFG = sandbox.window.STOUFA_CONFIG;
const B = CFG.boutique || {};
const SITE = (B.siteUrl || 'https://raoufd97.github.io/stoufa').replace(/\/$/, '');
const API = CFG.supabaseUrl.replace(/\/$/, '');
const BLOB = API + '/storage/v1/object/public/' + (CFG.bucket || 'photos') + '/';
const NOM = B.nom || 'Atelier Mustapha Attia';
const VILLE = B.ville || 'Ezzahra';
const DEPUIS = B.depuis || '1980';
const WA = String(B.whatsapp || '').replace(/\D/g, '');

/* ---------- Données ---------- */
// CATALOGUE_JSON=fichier.json permet de tester sans Supabase
let raw;
if (process.env.CATALOGUE_JSON) raw = JSON.parse(readFileSync(process.env.CATALOGUE_JSON, 'utf8'));
else {
  const res = await fetch(API + '/rest/v1/catalogue?select=*', { headers: { apikey: CFG.supabaseAnonKey } });
  if (!res.ok) throw new Error('Catalogue Supabase : HTTP ' + res.status + ' ' + await res.text());
  raw = await res.json();
}
if (!raw.length) throw new Error('Catalogue vide : rien à générer (vérifie la vue catalogue).');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const slugify = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'piece';

const MOTO = { mobylette: 'Mobylette', peugeot: 'Peugeot', vespa: 'Vespa' };
const items = raw.map(p => ({
  ...p,
  nom: clean(p.nom),
  modeles: (Array.isArray(p.modeles) ? p.modeles : []).filter(k => MOTO[k]),
  lies: Array.isArray(p.lies) ? p.lies : [],
  img: p.photo ? BLOB + encodeURIComponent(p.photo) : (p.photo_data || ''),
})).sort((a, b) => norm(a.nom).localeCompare(norm(b.nom)));

// Slugs uniques et stables tant que le nom ne change pas
const seen = new Map();
for (const p of items) {
  let s = slugify(p.nom);
  if (seen.has(s)) s = s + '-' + p.id.slice(0, 5).toLowerCase();
  seen.set(s, p.id); p.slug = s;
}
const byId = new Map(items.map(p => [p.id, p]));
// « Se vend avec » : le lien vaut dans les deux sens, comme dans l'appli
for (const p of items) for (const id of p.lies) { const x = byId.get(id); if (x && !x.lies.includes(p.id)) x.lies.push(p.id); }

const compat = p => p.categorie === 'velo' ? 'Vélo'
  : p.categorie === 'moto' ? (p.modeles.length ? p.modeles.map(k => k === 'peugeot' ? 'Peugeot 103' : MOTO[k]).join(', ') : 'Mobylette et moto')
  : 'Divers';
const pourTexte = p => p.categorie === 'velo' ? 'pour vélo'
  : p.categorie === 'moto' ? (p.modeles.length ? 'pour ' + p.modeles.map(k => k === 'peugeot' ? 'Peugeot 103' : MOTO[k]).join(', ') : 'pour mobylette et moto') : '';

/* ---------- Catégories ---------- */
const inMoto = k => p => p.categorie === 'moto' && (!p.modeles.length || p.modeles.includes(k));
const CATS = [
  { k: 'velo', label: 'Vélo', h1: 'Pièces vélo à Ezzahra', test: p => p.categorie === 'velo',
    title: 'Pièces vélo à Ezzahra : chambres à air, pneus, freins',
    intro: 'Chambres à air, pneus, chaînes, freins, rayons, pédales, roues… Les pièces de rechange vélo (ville, VTT, enfant) disponibles à la boutique, Rue 14 Janvier à Ezzahra.' },
  { k: 'mobylette', label: 'Mobylette', h1: 'Pièces mobylette à Ezzahra', test: inMoto('mobylette'),
    title: 'Pièces mobylette à Ezzahra',
    intro: 'Pièces moteur, éclairage, freinage, câbles et accessoires pour mobylette. Retrait à la boutique, Rue 14 Janvier à Ezzahra.' },
  { k: 'peugeot', label: 'Peugeot 103', h1: 'Pièces Peugeot 103 à Ezzahra', test: inMoto('peugeot'),
    title: 'Pièces Peugeot 103 à Ezzahra',
    intro: 'Pièces de rechange pour Peugeot 103 et mobylettes Peugeot : moteur, embrayage, éclairage, roues, chambres à air… Retrait à la boutique à Ezzahra.' },
  { k: 'vespa', label: 'Vespa', h1: 'Pièces Vespa à Ezzahra', test: inMoto('vespa'),
    title: 'Pièces Vespa à Ezzahra',
    intro: 'Pièces de rechange pour Vespa et scooters Piaggio. Retrait à la boutique, Rue 14 Janvier à Ezzahra.' },
];
for (const c of CATS) c.items = items.filter(c.test);

/* ---------- Titres et descriptions ---------- */
// Titre ≤ 60 caractères : on garde le plus précis qui tient
function fitTitle(main) {
  const opts = [`${main} | ${NOM}`, `${main} | Atelier Attia ${VILLE}`, `${main} | ${VILLE}`, main];
  for (const t of opts) if (t.length <= 60) return t;
  return main.slice(0, 57).replace(/\s+\S*$/, '') + '…';
}
const pieceTitle = p => {
  const n = p.nom;
  const opts = [`${n} à ${VILLE} | ${NOM}`, `${n} à ${VILLE} | Atelier Attia`, `${n} | ${NOM}`, `${n} | Atelier Attia`, `${n} · ${VILLE}`, n];
  for (const t of opts) if (t.length <= 60) return t;
  return n.slice(0, 59).replace(/\s+\S*$/, '') + '…';
};
const cut = (s, n = 158) => s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
const pieceDesc = p => cut(`${p.nom} ${pourTexte(p)} ${p.disponible ? 'disponible' : 'sur commande'} chez ${NOM}, Rue 14 Janvier, ${VILLE}. Pièces vélo et moto depuis ${DEPUIS}. Prix et réservation sur WhatsApp.`.replace(/\s+/g, ' '));

/* ---------- Gabarits ---------- */
const ICONS = {
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.7-1.2-1.5-1.4-1.7-.1-.2 0-.4.1-.5l.4-.4.3-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.2-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 2.2.9 2.6.7 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  bike: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="32" r="8"/><circle cx="37" cy="32" r="8"/><path d="M11 32l8-15h10l8 15M19 17l5 15h-13M27 11h6"/></svg>',
  moped: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="34" r="6"/><circle cx="37" cy="34" r="6"/><path d="M11 34h11l5-10h7l3 10M34 24l-3-10h-5M17 28h10"/><path d="M14 22h9"/></svg>',
  scooter: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="34" r="6"/><circle cx="37" cy="34" r="6"/><path d="M17 34h14c0-6-4-10-10-10h-8l-2 10"/><path d="M33 34l-4-20h-5M29 14h6"/></svg>',
  engine: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="16" width="22" height="18" rx="3"/><path d="M32 22h6v6h-6M16 16v-5h10v5M10 25H5M21 34v5"/><circle cx="21" cy="25" r="4"/></svg>',
};
const CAT_ICON = { velo: ICONS.bike, mobylette: ICONS.moped, peugeot: ICONS.engine, vespa: ICONS.scooter };
const waHref = t => 'https://wa.me/' + WA + '?text=' + encodeURIComponent(t);

function card(p, rel, opts = {}) {
  const href = `${rel}pieces/${p.slug}/`;
  return `<article class="card" data-id="${esc(p.id)}" data-nom="${esc(p.nom)}" data-cat="${esc(p.categorie)}" data-mod="${esc(p.modeles.join(' '))}" data-dispo="${p.disponible ? 1 : 0}" data-s="${esc(norm(p.nom + ' ' + compat(p)))}">
  <a class="card-link" href="${href}">
    <div class="card-img">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.nom)}" loading="lazy" decoding="async" width="400" height="400">` : ICONS.bike}${opts.badge ? `<span class="rank">${esc(opts.badge)}</span>` : ''}</div>
    <div class="card-body"><span class="compat">${esc(compat(p))}</span><h3>${esc(p.nom)}</h3></div>
  </a>
  <div class="card-foot"><span class="dispo ${p.disponible ? 'ok' : 'cmd'}">${p.disponible ? 'Disponible' : 'Sur commande'}</span>
    <button class="add" type="button" data-add="${esc(p.id)}" aria-label="Ajouter ${esc(p.nom)} à ma demande">${ICONS.plus}</button></div>
</article>`;
}

function page({ rel, path, title, desc, h1, body, ld = [], og = {}, bodyClass = '' }) {
  const canonical = SITE + '/' + path;
  const ldAll = [{
    '@context': 'https://schema.org', '@type': 'BicycleStore', '@id': SITE + '/#boutique', name: NOM, url: SITE + '/',
    image: SITE + '/assets/boutique-devanture.webp', foundingDate: DEPUIS,
    description: `Pièces de rechange vélo, mobylette, Peugeot 103 et Vespa à ${VILLE} depuis ${DEPUIS}.`,
    telephone: B.telephone || undefined,
    address: { '@type': 'PostalAddress', streetAddress: B.adresse ? B.adresse.split(',')[0] : undefined, addressLocality: VILLE, addressRegion: 'Ben Arous', addressCountry: 'TN' },
    hasMap: B.googleMaps || undefined, priceRange: '$',
  }, ...ld];
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="theme-color" content="#17624F">
<meta property="og:type" content="${og.type || 'website'}">
<meta property="og:site_name" content="${esc(NOM)}">
<meta property="og:locale" content="fr_TN">
<meta property="og:title" content="${esc(og.title || title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og.image || SITE + '/assets/boutique-interieur.webp')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${rel}icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${rel}icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="${rel}assets/vitrine.css">
<script type="application/ld+json">${JSON.stringify(ldAll.length === 1 ? ldAll[0] : ldAll).replace(/</g, '\\u003c')}</script>
</head>
<body class="${bodyClass}" data-rel="${rel}">
<header class="top">
  <div class="wrap top-in">
    <a class="logo" href="${rel}"><span class="logo-name">Atelier<br>Mustapha Attia</span><span class="stamp">depuis<b>${esc(DEPUIS)}</b></span></a>
    <nav class="top-nav" aria-label="Menu">
      <a href="${rel}#catalogue">Catalogue</a><a href="${rel}#boutique">La boutique</a>
    </nav>
    <button class="cart-btn" type="button" id="cartBtn" aria-label="Ma demande">${ICONS.bag}<span class="cart-n" id="cartN" hidden>0</span></button>
  </div>
</header>
${body}
<footer class="foot">
  <div class="wrap foot-in">
    <div><p class="foot-name">${esc(NOM)}</p><p>Pièces de rechange vélo, mobylette, Peugeot 103 et Vespa à ${esc(VILLE)} depuis ${esc(DEPUIS)}.</p></div>
    <ul class="facts">
      <li>${ICONS.pin}<span>${esc(B.adresse || VILLE)}${B.googleMaps ? ` · <a href="${esc(B.googleMaps)}" target="_blank" rel="noopener">Itinéraire</a>` : ''}</span></li>
      ${B.horaires ? `<li>${ICONS.clock}<span>${esc(B.horaires)}</span></li>` : ''}
      ${B.telephone ? `<li>${ICONS.tel}<a href="tel:${esc(B.telephone.replace(/\s/g, ''))}">${esc(B.telephone)}</a></li>` : ''}
      ${WA ? `<li>${ICONS.wa}<a href="${esc(waHref('Bonjour, je viens de votre site.'))}" target="_blank" rel="noopener">WhatsApp</a></li>` : ''}
    </ul>
    <nav class="foot-cats" aria-label="Catégories">${CATS.map(c => `<a href="${rel}categorie/${c.k}/">Pièces ${esc(c.label)}</a>`).join('')}</nav>
  </div>
</footer>

<div class="drawer" id="drawer" hidden>
  <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawerT">
    <div class="drawer-h"><h2 id="drawerT">Ma demande</h2><button class="x" type="button" id="drawerX" aria-label="Fermer">×</button></div>
    <p class="muted">Choisissez vos pièces, puis envoyez la liste sur WhatsApp. On vous répond avec les prix et on les met de côté pour le retrait en boutique.</p>
    <ul class="cart-list" id="cartList"></ul>
    <div class="drawer-f">
      <label class="field"><span>Votre prénom (facultatif)</span><input id="cartName" autocomplete="given-name"></label>
      <a class="btn wa block" id="cartSend" target="_blank" rel="noopener">${ICONS.wa}Envoyer ma demande sur WhatsApp</a>
    </div>
  </div>
</div>
<div class="toast" id="toast" hidden></div>
<a class="wa-fab" id="waFab" href="${esc(waHref('Bonjour, je viens de votre site. Je cherche une pièce :'))}" target="_blank" rel="noopener" aria-label="Écrire sur WhatsApp">${ICONS.wa}</a>
<script>window.VITRINE=${JSON.stringify({ api: API, key: CFG.supabaseAnonKey, wa: WA, rel }).replace(/</g, '\\u003c')};</script>
<script src="${rel}assets/vitrine.js" defer></script>
</body>
</html>
`;
}

/* ---------- Accueil ---------- */
const dispoN = items.filter(p => p.disponible).length;
const top = items.filter(p => p.rang).sort((a, b) => a.rang - b.rang).slice(0, 8);
const arrivages = items.filter(p => p.arrivage).sort((a, b) => String(b.arrivage).localeCompare(String(a.arrivage))).slice(0, 8);

const rail = (id, title, sub, list, badge) => list.length ? `
<section class="sec" aria-labelledby="${id}">
  <div class="wrap">
    <div class="sec-h"><div><h2 id="${id}">${title}</h2><p class="muted">${sub}</p></div></div>
    <div class="rail">${list.map((p, i) => card(p, '', { badge: badge ? badge(p, i) : '' })).join('')}</div>
  </div>
</section>` : '';

const homeBody = `
<main>
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-txt">
      <p class="kicker"><span class="tag">${esc(VILLE)}</span> Rue 14 Janvier · depuis ${esc(DEPUIS)}</p>
      <h1>Pièces vélo, mobylette et Peugeot 103 à ${esc(VILLE)}</h1>
      <p class="lead">Plus de ${Math.floor(items.length / 10) * 10} références en boutique. Trouvez votre pièce ici, envoyez votre demande sur WhatsApp, et passez la récupérer.</p>
      <div class="hero-cta">
        <a class="btn primary" href="#catalogue">Voir le catalogue ${ICONS.arrow}</a>
        ${WA ? `<a class="btn wa" href="${esc(waHref('Bonjour, je viens de votre site. Je cherche une pièce :'))}" target="_blank" rel="noopener">${ICONS.wa}WhatsApp</a>` : ''}
      </div>
      <ul class="hero-facts"><li><b>${items.length}</b> pièces en ligne</li><li><b>${dispoN}</b> disponibles</li><li><b>${new Date().getFullYear() - Number(DEPUIS)}</b> ans d'atelier</li></ul>
    </div>
    <figure class="hero-img"><img src="assets/boutique-interieur.webp" alt="L'intérieur de l'atelier : roues de vélo et étagères de pièces" width="1000" height="750" fetchpriority="high"><figcaption class="tag">Atelier Mustapha Attia</figcaption></figure>
  </div>
</section>

<section class="sec cats-sec" aria-labelledby="catsT">
  <div class="wrap">
    <h2 id="catsT" class="vh">Catégories</h2>
    <div class="cats">${CATS.map(c => `<a class="cat" href="categorie/${c.k}/"><span class="cat-ico">${CAT_ICON[c.k]}</span><span class="cat-name">${esc(c.label)}</span><span class="cat-n">${c.items.length} pièces</span></a>`).join('')}</div>
  </div>
</section>

${rail('topT', 'Les plus demandées', 'Les pièces qui partent le plus en ce moment.', top, (p, i) => '#' + (i + 1))}
${rail('newT', 'Nouveaux arrivages', 'Dernières pièces arrivées à la boutique.', arrivages)}

<section class="sec" id="catalogue" aria-labelledby="allT">
  <div class="wrap">
    <div class="sec-h"><div><h2 id="allT">Tout le catalogue</h2><p class="muted">Prix donnés en boutique ou sur WhatsApp. La disponibilité est mise à jour au fil des ventes.</p></div></div>
    <div class="filters">
      <input id="q" type="search" placeholder="Chercher : chambre à air, chaîne, Peugeot 103…" autocomplete="off" aria-label="Chercher une pièce">
      <div class="chips" role="group" aria-label="Filtrer">
        <button class="chip" type="button" data-f="tout" aria-pressed="true">Tout</button>
        ${CATS.map(c => `<button class="chip" type="button" data-f="${c.k}" aria-pressed="false">${esc(c.label)}</button>`).join('')}
        <button class="chip" type="button" data-f="dispo" aria-pressed="false">Disponible</button>
      </div>
    </div>
    <p class="count muted" id="count" aria-live="polite">${items.length} pièces</p>
    <div class="grid" id="grid">${items.map(p => card(p, '')).join('')}</div>
    <div class="empty" id="empty" hidden><p>Pas trouvé ? On a peut-être la pièce sans l'avoir encore mise en ligne.</p>${WA ? `<a class="btn wa" id="emptyWa" href="${esc(waHref('Bonjour, avez-vous cette pièce : '))}" target="_blank" rel="noopener">${ICONS.wa}Demander sur WhatsApp</a>` : ''}</div>
  </div>
</section>

<section class="sec boutique" id="boutique" aria-labelledby="boutT">
  <div class="wrap boutique-in">
    <figure><img src="assets/boutique-devanture.webp" alt="La devanture de l'atelier, Rue 14 Janvier à ${esc(VILLE)}" width="900" height="675" loading="lazy"></figure>
    <div>
      <h2 id="boutT">La boutique</h2>
      <p>Depuis ${esc(DEPUIS)}, l'atelier vend des pièces de rechange pour vélos, mobylettes, Peugeot 103 et Vespa. Petite boutique de quartier sous l'auvent bleu, Rue 14 Janvier à ${esc(VILLE)} : on connaît les pièces, et on vous aide à trouver la bonne.</p>
      <ol class="steps">
        <li><b>Choisissez</b> vos pièces sur le site.</li>
        <li><b>Envoyez</b> votre demande sur WhatsApp : on vous répond avec les prix.</li>
        <li><b>Passez</b> les récupérer à la boutique.</li>
      </ol>
      <div class="hero-cta">${B.googleMaps ? `<a class="btn primary" href="${esc(B.googleMaps)}" target="_blank" rel="noopener">${ICONS.pin}Itinéraire</a>` : ''}${WA ? `<a class="btn wa" href="${esc(waHref('Bonjour, je viens de votre site.'))}" target="_blank" rel="noopener">${ICONS.wa}WhatsApp</a>` : ''}</div>
    </div>
  </div>
</section>
</main>`;

const out = [];
const write = (rel, html) => { const f = join(ROOT, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); out.push(rel); };

write('index.html', page({
  rel: '', path: '',
  title: fitTitle(`Pièces vélo et mobylette à ${VILLE}`),
  desc: cut(`Pièces de rechange vélo, mobylette, Peugeot 103 et Vespa à ${VILLE} depuis ${DEPUIS}. ${items.length} pièces en ligne, disponibilité à jour, demande et réservation sur WhatsApp.`),
  body: homeBody, bodyClass: 'home',
  og: { title: `${NOM} · Pièces vélo et moto à ${VILLE}` },
}));

/* ---------- Catégories ---------- */
const crumbs = (list) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: list.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })) });

for (const c of CATS) {
  const rel = '../../';
  write(`categorie/${c.k}/index.html`, page({
    rel, path: `categorie/${c.k}/`,
    title: fitTitle(c.title).length <= 60 ? fitTitle(c.title) : fitTitle(c.h1),
    desc: cut(`${c.intro} ${c.items.length} pièces en ligne, demande et réservation sur WhatsApp.`),
    ld: [crumbs([['Accueil', SITE + '/'], ['Pièces ' + c.label, `${SITE}/categorie/${c.k}/`]])],
    body: `<main>
<section class="sec page-h"><div class="wrap">
  <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${rel}">Accueil</a><span>›</span><span>Pièces ${esc(c.label)}</span></nav>
  <h1>${esc(c.h1)}</h1><p class="lead">${esc(c.intro)}</p>
  <div class="filters"><input id="q" type="search" placeholder="Chercher dans les pièces ${esc(c.label)}…" autocomplete="off" aria-label="Chercher une pièce">
    <div class="chips" role="group" aria-label="Filtrer"><button class="chip" type="button" data-f="tout" aria-pressed="true">Toutes (${c.items.length})</button><button class="chip" type="button" data-f="dispo" aria-pressed="false">Disponibles</button></div></div>
  <p class="count muted" id="count" aria-live="polite">${c.items.length} pièces</p>
  <div class="grid" id="grid">${c.items.map(p => card(p, rel)).join('')}</div>
  <div class="empty" id="empty" hidden><p>Pas trouvé ? Demandez-nous directement.</p>${WA ? `<a class="btn wa" id="emptyWa" href="${esc(waHref('Bonjour, avez-vous cette pièce : '))}" target="_blank" rel="noopener">${ICONS.wa}Demander sur WhatsApp</a>` : ''}</div>
  <nav class="other-cats" aria-label="Autres catégories">${CATS.filter(x => x !== c).map(x => `<a class="cat sm" href="${rel}categorie/${x.k}/"><span class="cat-ico">${CAT_ICON[x.k]}</span><span class="cat-name">Pièces ${esc(x.label)}</span></a>`).join('')}</nav>
</div></section></main>`,
  }));
}

/* ---------- Une page par pièce ---------- */
if (existsSync(join(ROOT, 'pieces'))) rmSync(join(ROOT, 'pieces'), { recursive: true, force: true });
const catOfPiece = p => p.categorie === 'velo' ? CATS[0] : p.categorie === 'moto' ? (CATS.find(c => c.k === p.modeles[0]) || CATS[2]) : null;
for (const p of items) {
  const rel = '../../';
  const cat = catOfPiece(p);
  const liees = p.lies.map(id => byId.get(id)).filter(Boolean).slice(0, 8);
  const simil = items.filter(x => x.id !== p.id && !p.lies.includes(x.id) && x.categorie === p.categorie
    && (p.categorie !== 'moto' || !p.modeles.length || !x.modeles.length || x.modeles.some(m => p.modeles.includes(m))))
    .map(x => { const a = new Set(norm(p.nom).split(/\W+/).filter(w => w.length > 2)); return [x, norm(x.nom).split(/\W+/).filter(w => a.has(w)).length + (x.disponible ? .5 : 0)]; })
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
  const ask = `Bonjour, avez-vous « ${p.nom} » ? (vu sur votre site)`;
  write(`pieces/${p.slug}/index.html`, page({
    rel, path: `pieces/${p.slug}/`,
    title: pieceTitle(p), desc: pieceDesc(p), bodyClass: 'piece',
    og: { type: 'product', image: p.photo ? p.img : undefined, title: `${p.nom} · ${NOM}` },
    ld: [crumbs([['Accueil', SITE + '/'], ...(cat ? [['Pièces ' + cat.label, `${SITE}/categorie/${cat.k}/`]] : []), [p.nom, `${SITE}/pieces/${p.slug}/`]])],
    body: `<main>
<section class="sec page-h"><div class="wrap">
  <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${rel}">Accueil</a><span>›</span>${cat ? `<a href="${rel}categorie/${cat.k}/">Pièces ${esc(cat.label)}</a><span>›</span>` : ''}<span>${esc(p.nom)}</span></nav>
  <div class="prod" data-id="${esc(p.id)}" data-nom="${esc(p.nom)}">
    <figure class="prod-img">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.nom)} ${esc(pourTexte(p))}" width="800" height="800" fetchpriority="high">` : ICONS.bike}</figure>
    <div class="prod-info">
      <span class="compat">${esc(compat(p))}</span>
      <h1>${esc(p.nom)}</h1>
      <p class="dispo big ${p.disponible ? 'ok' : 'cmd'}" data-dispo-badge>${p.disponible ? 'Disponible en boutique' : 'Sur commande'}</p>
      <p class="muted">${p.disponible ? 'En stock à la boutique de ' + esc(VILLE) + '.' : 'Plus en stock pour le moment : demandez-nous, on peut la recommander.'} Prix donné en boutique ou sur WhatsApp.</p>
      <div class="qty-row">
        <div class="step"><button type="button" data-step="-1" aria-label="Une de moins">−</button><input id="qty" inputmode="numeric" value="1" aria-label="Quantité"><button type="button" data-step="1" aria-label="Une de plus">+</button></div>
        <button class="btn primary grow" type="button" data-add="${esc(p.id)}" data-qty="#qty">${ICONS.bag}Ajouter à ma demande</button>
      </div>
      ${WA ? `<a class="btn wa block" href="${esc(waHref(ask))}" target="_blank" rel="noopener">${ICONS.wa}Demander directement sur WhatsApp</a>` : ''}
      <ul class="prod-facts">
        <li>${ICONS.pin}<span>Retrait à la boutique, ${esc(B.adresse || VILLE)}</span></li>
        <li>${ICONS.clock}<span>Réponse rapide sur WhatsApp avec le prix</span></li>
      </ul>
    </div>
  </div>
</div></section>
${liees.length ? `<section class="sec"><div class="wrap"><div class="sec-h"><div><h2>Souvent achetée avec</h2></div></div><div class="rail">${liees.map(x => card(x, rel)).join('')}</div></div></section>` : ''}
${simil.length ? `<section class="sec"><div class="wrap"><div class="sec-h"><div><h2>Pièces similaires</h2></div>${cat ? `<a class="more" href="${rel}categorie/${cat.k}/">Toutes les pièces ${esc(cat.label)} ${ICONS.arrow}</a>` : ''}</div><div class="rail">${simil.map(x => card(x, rel)).join('')}</div></div></section>` : ''}
</main>`,
  }));
}

/* ---------- Ancienne adresse /catalogue/ → accueil ---------- */
write('catalogue/index.html', `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(NOM)}</title><link rel="canonical" href="${SITE}/"><meta name="robots" content="noindex,follow"><meta http-equiv="refresh" content="0; url=../"><script>location.replace('../'+location.hash)</script></head><body><a href="../">Voir le catalogue</a></body></html>`);

/* ---------- Plan du site ---------- */
const today = new Date().toISOString().slice(0, 10);
const urls = ['', ...CATS.map(c => `categorie/${c.k}/`), ...items.map(p => `pieces/${p.slug}/`)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}/${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);

console.log(`Vitrine générée : ${items.length} pièces, ${CATS.length} catégories, ${top.length} meilleures ventes, ${arrivages.length} arrivages, ${out.length} fichiers.`);
