/*
  Adaptateur Supabase pour l'appli Boutique de Stoufa.
  L'appli a été écrite pour le stockage de Claude (window.claude.use('db' | 'assets' | 'downloads')).
  Ce fichier recrée exactement la même interface au-dessus de Supabase, pour que
  index.html reste identique (design, onglets, calculs).

  - db        : table "docs" (collection, id, data jsonb) + temps réel
  - assets    : bucket Storage "photos" (public en lecture, écriture réservée au compte boutique)
  - downloads : téléchargement classique d'un fichier (export Excel)
*/
(function () {
  const CFG = window.STOUFA_CONFIG || {};
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'stoufa-auth' }
  });
  const BUCKET = CFG.bucket || 'photos';
  window.BLOB_BASE = CFG.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/' + BUCKET + '/';

  const rid = (n, chars) => {
    const a = new Uint8Array(n); crypto.getRandomValues(a);
    return Array.from(a, x => chars[x % chars.length]).join('');
  };
  const newDocId = () => rid(20, 'abcdefghijklmnopqrstuvwxyz0123456789');
  const newAssetId = () => rid(32, '0123456789abcdef');
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const clone = o => JSON.parse(JSON.stringify(o ?? {}));

  /* ---------- Code d'accès ---------- */
  let ready = null;
  function login() {
    if (ready) return ready;
    ready = (async () => {
      const { data } = await sb.auth.getSession();
      if (data && data.session) return;
      await askPassword();
    })();
    return ready;
  }
  function askPassword() {
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.style.cssText = 'position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:var(--bg,#EEF1EE);padding:16px';
      box.innerHTML = `
        <form style="width:100%;max-width:360px;background:var(--surface,#fff);border:1px solid var(--line,#D3DBD7);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px">
          <h1 style="margin:0;font-family:var(--f-display,sans-serif);font-weight:700;font-size:28px;text-transform:uppercase;line-height:1">Boutique de Stoufa</h1>
          <p style="margin:0;color:var(--muted,#5B6964);font-size:15px">Entre le code d'accès de la boutique. Il ne sera demandé qu'une fois sur ce téléphone.</p>
          <input type="password" autocomplete="current-password" required placeholder="Code d'accès" aria-label="Code d'accès"
            style="height:48px;border:1px solid var(--line,#D3DBD7);border-radius:10px;background:var(--bg,#EEF1EE);padding:0 14px;font:inherit;font-size:17px;color:inherit">
          <span data-msg style="color:var(--bad,#B3261E);font-size:14px;min-height:1em"></span>
          <button type="submit" style="height:48px;border-radius:10px;border:0;background:var(--accent,#17624F);color:var(--accent-ink,#fff);font:inherit;font-weight:600;font-size:16px">Entrer</button>
        </form>`;
      document.body.appendChild(box);
      const form = box.querySelector('form'), inp = box.querySelector('input'), msg = box.querySelector('[data-msg]'), btn = box.querySelector('button');
      setTimeout(() => inp.focus(), 50);
      form.onsubmit = async e => {
        e.preventDefault(); btn.disabled = true; msg.textContent = '';
        const { error } = await sb.auth.signInWithPassword({ email: CFG.email, password: inp.value });
        btn.disabled = false;
        if (error) { msg.textContent = /network|fetch/i.test(error.message) ? 'Pas de connexion internet.' : 'Code incorrect.'; inp.select(); return; }
        box.remove(); resolve();
      };
    });
  }

  /* ---------- Base de données (même forme que Firestore) ---------- */
  const cache = {};       // collection -> Map(id -> data)
  const listeners = {};   // collection -> Set({next, error})
  const loaded = {};      // collection -> Promise
  let channel = null;

  const snapshot = col => ({ docs: [...(cache[col] || new Map()).entries()].map(([id, d]) => ({ id, data: () => clone(d) })) });
  const emit = col => (listeners[col] || []).forEach(l => { try { l.next(snapshot(col)) } catch (e) { console.error(e) } });

  async function fetchAll(col) {
    const rows = []; const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await sb.from('docs').select('id,data').eq('col', col).range(from, from + page - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < page) break;
    }
    cache[col] = new Map(rows.map(r => [r.id, r.data || {}]));
    emit(col);
  }
  function ensureLoaded(col) {
    if (!loaded[col]) loaded[col] = fetchAll(col).catch(e => { loaded[col] = null; (listeners[col] || []).forEach(l => l.error && l.error(e)); });
    return loaded[col];
  }
  function refreshAll() { Object.keys(listeners).forEach(col => { loaded[col] = null; ensureLoaded(col); }); }

  function ensureChannel() {
    if (channel) return;
    let first = true;
    channel = sb.channel('docs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
        const row = p.eventType === 'DELETE' ? p.old : p.new;
        if (!row || !row.col || !cache[row.col]) return;
        if (p.eventType === 'DELETE') cache[row.col].delete(row.id);
        else cache[row.col].set(row.id, row.data || {});
        emit(row.col);
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { if (!first) refreshAll(); first = false; }   // rattrape ce qui a été manqué
      });
    // Téléphone remis au premier plan : on recharge pour être sûr d'être à jour
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });
    window.addEventListener('online', refreshAll);
  }

  const local = {
    set(col, id, data) { (cache[col] || (cache[col] = new Map())).set(id, clone(data)); emit(col); },
    merge(col, id, patch) { const m = cache[col] || (cache[col] = new Map()); m.set(id, Object.assign(clone(m.get(id)), clone(patch))); emit(col); },
    del(col, id) { if (cache[col]) { cache[col].delete(id); emit(col); } }
  };
  const split = path => { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };
  const fail = e => { throw err((e && e.code) || 'write_failed', e && e.message); };

  const db = {
    collection(col) {
      return {
        async add(data) {
          const id = newDocId();
          const { error } = await sb.from('docs').insert({ col, id, data: clone(data) });
          if (error) fail(error);
          local.set(col, id, data);
          return { id };
        },
        onSnapshot(next, error) {
          const l = { next, error };
          (listeners[col] || (listeners[col] = new Set())).add(l);
          ensureChannel();
          if (cache[col] && loaded[col]) Promise.resolve().then(() => next(snapshot(col)));
          ensureLoaded(col);
          return () => listeners[col].delete(l);
        }
      };
    },
    doc(path) {
      const [col, id] = split(path);
      return {
        async set(data) {
          const { error } = await sb.from('docs').upsert({ col, id, data: clone(data) });
          if (error) fail(error);
          local.set(col, id, data);
        },
        async update(patch) {
          const { error } = await sb.rpc('doc_merge', { p_col: col, p_id: id, p_patch: clone(patch) });
          if (error) fail(error);
          local.merge(col, id, patch);
        },
        async delete() {
          const { error } = await sb.from('docs').delete().eq('col', col).eq('id', id);
          if (error) fail(error);
          local.del(col, id);
        },
        async get() {
          const { data, error } = await sb.from('docs').select('data').eq('col', col).eq('id', id).maybeSingle();
          if (error) fail(error);
          return { id, exists: !!data, data: () => (data ? clone(data.data) : undefined) };
        }
      };
    }
  };

  /* ---------- Photos ---------- */
  const assets = {
    async upload(blob, opt = {}) {
      const id = newAssetId();
      const { error } = await sb.storage.from(BUCKET).upload(id, blob, { contentType: opt.type || blob.type || 'image/jpeg', upsert: false, cacheControl: '31536000' });
      if (error) throw err(/quota|exceed/i.test(error.message) ? 'quota_exceeded' : 'upload_failed', error.message);
      return { id, url: window.BLOB_BASE + id };
    },
    async delete(id) {
      const { error } = await sb.storage.from(BUCKET).remove([id]);
      if (error) throw err('delete_failed', error.message);
    },
    url: id => window.BLOB_BASE + id
  };

  /* ---------- Téléchargements (export Excel) ---------- */
  const downloads = {
    async save({ filename, data, type }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'fichier'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  };

  /* ---------- Même point d'entrée que dans Claude ---------- */
  const services = { db, assets, downloads };
  window.claude = {
    async use(name) {
      if (!services[name]) throw err('unavailable', name + ' indisponible');
      await login();
      return services[name];
    }
  };
  window.stoufaLogout = async () => { await sb.auth.signOut(); location.reload(); };
})();
