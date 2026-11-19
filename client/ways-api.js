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
      if (!r.ok) throw new Error(data.error || ('Erreur ' + r.status));
      return data;
    }
    const enc = encodeURIComponent;

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
    }
    async function poll() {
      if (running) return;
      running = true;
      try {
        const colls = Object.keys(subs).filter(c => subs[c].size);
        if (!colls.length) return;
        let more = true;
        const touched = new Set();
        while (more) {
          const r = await req('GET', 'changes?since=' + rev + '&colls=' + colls.map(enc).join(','));
          r.changes.forEach(ch => { apply(ch); touched.add(ch.coll); });
          rev = r.rev; more = r.more;
        }
        touched.forEach(emit);
        if (opts.onStatus) opts.onStatus('online');
      } catch (e) {
        if (opts.onStatus) opts.onStatus('offline', e);
      } finally { running = false; }
    }
    function startLoop() {
      if (timer) return;
      timer = setInterval(poll, interval);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    }

    async function loadColl(coll) {
      const r = await req('GET', 'docs/' + enc(coll));
      const m = new Map();
      r.docs.forEach(d => m.set(d.id, d.data));
      cache[coll] = m;
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
        local(coll, id, clean);
        return req('PUT', 'docs/' + enc(coll) + '/' + enc(id), clean);
      },
      async patch(coll, id, fields) {
        const cur = cache[coll] && cache[coll].get(id);
        if (cur) local(coll, id, Object.assign({}, cur, fields));
        const r = await req('PATCH', 'docs/' + enc(coll) + '/' + enc(id), fields);
        return r;
      },
      async remove(coll, id) {
        local(coll, id, null);
        return req('DELETE', 'docs/' + enc(coll) + '/' + enc(id));
      },

      async removeMany(coll, ids) {
        const m = cache[coll];
        if (m) { ids.forEach(id => m.delete(id)); emit(coll); }
        return req('POST', 'delete', { [coll]: ids });
      },

      onSnapshot(coll, cb) {
        (subs[coll] || (subs[coll] = new Set())).add(cb);
        const ready = cache[coll] ? Promise.resolve() : loadColl(coll);
        ready.then(() => { emit(coll); startLoop(); }).catch(e => opts.onStatus && opts.onStatus('offline', e));
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
