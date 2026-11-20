/* Client de l'API my-145-station — remplace la base et les fichiers de l'artéfact claude.ai.
 *
 *   const api = WaysAPI({ base: '/erp/api/', token: '...' });
 *   await api.save('clients', 'c-001', { name: 'Liege Airport' });
 *   await api.patch('clients', 'c-001', { lang: 'EN' });
 *   await api.remove('clients', 'c-001');
 *   const stop = api.onSnapshot('clients', docs => render(docs));  // docs = [{id, ...données}]
 *   const f = await api.upload(fichier);  img.src = api.fileUrl(f.id);
 *   await api.upload(fichier, { id: '<32 hex>' });   // migration : garde l'identifiant d'origine
 */
(function (global) {
  function WaysAPI(opts) {
    const base = (opts.base || '/erp/api/').replace(/\/?$/, '/');
    const token = opts.token || '';
    const interval = opts.pollMs || 3000;

    async function req(method, path, body) {
      const init = { method, headers: { Authorization: 'Bearer ' + token } };
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      // Certains hébergements bloquent PUT/PATCH/DELETE : on passe par POST + en-tête.
      if (opts.methodOverride && method !== 'GET' && method !== 'POST') {
        init.headers['X-HTTP-Method-Override'] = method;
        init.method = 'POST';
      }
      const r = await fetch(base + path, init);
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 && opts.onUnauthorized) opts.onUnauthorized();
      if (!r.ok) { const e = new Error(data.error || ('Erreur ' + r.status)); e.status = r.status; throw e; }
      return data;
    }
    const enc = encodeURIComponent;
    const netErr = e => !e || !e.status;   // pas de réponse du serveur (hors ligne), et non un refus

    /* ---- Mode hors ligne ----
       Copie locale des données (IndexedDB) pour ouvrir l'application sans réseau, et file d'attente des modifications
       (localStorage) envoyées dans l'ordre au retour de la connexion. Avant d'envoyer la première modification d'un
       document, on relit la version du serveur : si quelqu'un d'autre l'a changée entre-temps, c'est un conflit
       (signalé à l'écran ; la modification hors ligne est quand même enregistrée, l'autre version reste récupérable).
       La copie locale et la file sont liées à l'utilisateur (offline(uid)) : un autre compte sur le même appareil ne les voit pas. */
    let uidOff = '', outbox = [], flushing = false, saveT = null;
    const OUT_LS = 'st-outbox', IDB = 'my145-offline';
    const srv = {};        // coll -> Map(id -> JSON de la dernière version connue du serveur)
    const srvSet = (coll, id, data) => { const m = srv[coll] || (srv[coll] = new Map()); if (data == null) m.delete(id); else m.set(id, JSON.stringify(data)); };
    function idb(mode, fn) {
      return new Promise((res, rej) => {
        if (!global.indexedDB) return rej(new Error('IndexedDB indisponible'));
        const o = indexedDB.open(IDB, 1);
        o.onupgradeneeded = () => o.result.createObjectStore('kv');
        o.onerror = () => rej(o.error);
        o.onsuccess = () => { const db = o.result, tx = db.transaction('kv', mode), st = tx.objectStore('kv'), r = fn(st);
          tx.oncomplete = () => { db.close(); res(r && r.result); }; tx.onerror = () => { db.close(); rej(tx.error); }; };
      });
    }
    function persist(now) {
      if (!uidOff) return;
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        const snap = { uid: uidOff, rev, at: Date.now(), cache: {}, srv: {} };
        for (const c in cache) snap.cache[c] = [...cache[c].entries()];
        for (const c in srv) snap.srv[c] = [...srv[c].entries()];
        idb('readwrite', st => st.put(snap, 'snap')).catch(() => {});
      }, now ? 0 : 1500);
    }
    /* modifications encore en attente : réappliquées sur les données chargées (serveur ou copie locale) */
    function replay(coll) {
      const m = cache[coll]; if (!m) return;
      for (const op of outbox) if (op.coll === coll) { if (op.method === 'DELETE') m.delete(op.id); else m.set(op.id, op.method === 'PATCH' ? Object.assign({}, m.get(op.id), op.body) : op.body); }
    }
    let restoring = null;
    function restore() {
      if (!uidOff) return Promise.resolve(false);
      return restoring || (restoring = idb('readonly', st => st.get('snap')).then(snap => {
        if (!snap || snap.uid !== uidOff) return false;
        for (const c in snap.cache) if (!cache[c]) { cache[c] = new Map(snap.cache[c]); replay(c); }
        for (const c in snap.srv) if (!srv[c]) srv[c] = new Map(snap.srv[c]);
        if (!rev) rev = snap.rev || 0;
        return true;
      }).catch(() => false));
    }
    const outLoad = () => { try { const a = JSON.parse(localStorage.getItem(OUT_LS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
    const outSave = () => { try { const all = outLoad().filter(x => x.uid !== uidOff).concat(outbox); localStorage.setItem(OUT_LS, JSON.stringify(all)); } catch (e) {} };
    const queued = () => { if (opts.onQueue) opts.onQueue(outbox.length); };
    function enqueue(method, coll, id, body, base) {
      outbox.push({ uid: uidOff, method, coll, id, body, base, at: new Date().toISOString() });
      outSave(); queued(); persist(true);
      if (opts.onStatus) opts.onStatus('offline');
      return { ok: true, queued: true };
    }
    async function write(method, coll, id, body, base) {
      const path = 'docs/' + enc(coll) + '/' + enc(id);
      if (uidOff && outbox.length) return enqueue(method, coll, id, body, base);   // garder l'ordre des modifications
      try { const r = await req(method, path, body); srvSet(coll, id, method === 'DELETE' ? null : (cache[coll] && cache[coll].get(id)) || null); persist(); return r; }
      catch (e) { if (uidOff && netErr(e)) return enqueue(method, coll, id, body, base); throw e; }
    }
    async function flush() {
      if (flushing || !outbox.length) return;
      flushing = true;
      const res = { sent: 0, conflicts: [], errors: [] }, checked = new Set();
      try {
        while (outbox.length) {
          const op = outbox[0], k = op.coll + '/' + op.id, path = 'docs/' + enc(op.coll) + '/' + enc(op.id);
          if (!checked.has(k)) {
            checked.add(k);
            const cur = await req('GET', path).then(d => d.data).catch(e => { if (netErr(e)) throw e; return null; });
            const curJ = cur == null ? null : JSON.stringify(cur);
            if (curJ !== (op.base ?? null)) res.conflicts.push({ coll: op.coll, id: op.id, at: op.at, base: op.base ? JSON.parse(op.base) : null, theirs: cur });
          }
          try { await req(op.method, path, op.body); res.sent++; }
          catch (e) { if (netErr(e)) throw e; res.errors.push({ coll: op.coll, id: op.id, msg: e.message }); }
          outbox.shift(); outSave();
        }
      } catch (e) { /* toujours hors ligne : on réessaiera */ }
      finally {
        flushing = false; queued();
        if ((res.sent || res.conflicts.length || res.errors.length) && opts.onSync) opts.onSync(Object.assign(res, { pending: outbox.length }));
      }
      if (outbox.length) throw new Error('hors ligne');
    }

    // ---- Cache local + mises à jour en direct (une seule boucle pour toutes les collections) ----
    const cache = {};      // coll -> Map(id -> data)
    const subs = {};       // coll -> Set(callback)
    let rev = 0, timer = null, running = false;

    function emit(coll) {
      const list = [...(cache[coll] || new Map()).entries()].map(([id, d]) => Object.assign({ id }, d));
      (subs[coll] || []).forEach(cb => { try { cb(list); } catch (e) { console.error(e); } });
    }
    function apply(ch) {
      const m = cache[ch.coll] || (cache[ch.coll] = new Map());
      if (ch.deleted) m.delete(ch.id); else m.set(ch.id, ch.data);
      srvSet(ch.coll, ch.id, ch.deleted ? null : ch.data);
    }
    async function poll() {
      if (running) return;
      running = true;
      try {
        const colls = Object.keys(subs).filter(c => subs[c].size);
        if (!colls.length) return;
        if (outbox.length) await flush();   // d'abord envoyer ce qui a été fait hors ligne
        let more = true;
        const touched = new Set();
        while (more) {
          const r = await req('GET', 'changes?since=' + rev + '&colls=' + colls.map(enc).join(','));
          r.changes.forEach(ch => { apply(ch); touched.add(ch.coll); });
          rev = r.rev; more = r.more;
        }
        touched.forEach(emit);
        if (touched.size) persist();
        if (opts.onStatus) opts.onStatus('online');
      } catch (e) {
        if (opts.onStatus) opts.onStatus('offline', e);
      } finally { running = false; }
    }
    function startLoop() {
      if (timer) return;
      timer = setInterval(poll, interval);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
      global.addEventListener('online', () => poll());
    }

    async function loadColl(coll) {
      const r = await req('GET', 'docs/' + enc(coll));
      const m = new Map();
      const sm = new Map();
      r.docs.forEach(d => { m.set(d.id, d.data); sm.set(d.id, JSON.stringify(d.data)); });
      cache[coll] = m; srv[coll] = sm;
      replay(coll);
      persist();
      if (!rev) rev = r.rev; else rev = Math.min(rev, r.rev);
    }

    // Écriture : mise à jour immédiate de l'écran, puis serveur.
    function local(coll, id, data) {
      const m = cache[coll];
      if (!m) return;
      if (data === null) m.delete(id); else m.set(id, data);
      emit(coll);
    }

    return {
      get: (coll, id) => req('GET', 'docs/' + enc(coll) + '/' + enc(id)).then(d => Object.assign({ id }, d.data)).catch(() => null),
      list: coll => req('GET', 'docs/' + enc(coll)).then(r => r.docs.map(d => Object.assign({ id: d.id }, d.data))),

      async save(coll, id, data) {
        const clean = Object.assign({}, data); delete clean.id;
        const base = srv[coll] ? srv[coll].get(id) ?? null : null;
        local(coll, id, clean);
        return write('PUT', coll, id, clean, base);
      },
      async patch(coll, id, fields) {
        const cur = cache[coll] && cache[coll].get(id), base = srv[coll] ? srv[coll].get(id) ?? null : null;
        if (cur) local(coll, id, Object.assign({}, cur, fields));
        return write('PATCH', coll, id, fields, base);
      },
      async remove(coll, id) {
        const base = srv[coll] ? srv[coll].get(id) ?? null : null;
        local(coll, id, null);
        return write('DELETE', coll, id, undefined, base);
      },
      /* hors ligne : active la copie locale et la file d'attente pour cet utilisateur */
      offline(uid) { uidOff = String(uid || ''); outbox = outLoad().filter(x => x.uid === uidOff); queued(); },
      pending: () => outbox.length,
      async forgetOffline() { outbox = []; outSave(); clearTimeout(saveT); uidOff = ''; try { await idb('readwrite', st => st.delete('snap')); } catch (e) {} },

      async removeMany(coll, ids) {
        const m = cache[coll];
        if (m) { ids.forEach(id => m.delete(id)); emit(coll); }
        return req('POST', 'delete', { [coll]: ids });
      },

      onSnapshot(coll, cb) {
        (subs[coll] || (subs[coll] = new Set())).add(cb);
        const ready = cache[coll] ? Promise.resolve() : loadColl(coll).catch(async e => {
          if (!netErr(e) || !(await restore()) || !cache[coll]) throw e;   // hors ligne : la copie locale
          if (opts.onStatus) opts.onStatus('offline', e);
        });
        ready.then(() => { emit(coll); startLoop(); }).catch(e => { if (opts.onStatus) opts.onStatus('offline', e); startLoop(); });
        return () => subs[coll].delete(cb);
      },

      call: (method, path, body) => req(method, path, body),   // routes auth/… (utilisateurs, déconnexion)
      importAll: all => req('POST', 'import', all),
      exportUrl: () => base + 'export?token=' + enc(token),

      async upload(file, extra) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        if (extra) Object.keys(extra).forEach(k => fd.append(k, extra[k]));
        const r = await fetch(base + 'files', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Envoi impossible');
        return d;
      },
      async postFile(path, file, extra) {   // envoi d'un fichier vers une autre route (OneDrive…)
        const fd = new FormData();
        fd.append('file', file, file.name);
        if (extra) Object.keys(extra).forEach(k => fd.append(k, extra[k]));
        const r = await fetch(base + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Envoi impossible');
        return d;
      },
      fileUrl: (id, download) => base + 'files/' + id + '?token=' + enc(token) + (download ? '&download=1' : ''),
      removeFile: id => req('DELETE', 'files/' + id),
      refresh: poll,
    };
  }
  global.WaysAPI = WaysAPI;
})(window);
