/* VIT Portal — browser client for the MongoDB API in serve.py.
   Same chainable shape the data layer uses: db.from(t).select().eq().order().range() / insert / update / delete / upsert,
   db.rpc(name, args), db.auth.signInWithPassword / getSession / signOut. Every call resolves to { data, error, count }. */
(function () {
  'use strict';
  const KEY = 'vit-session'; // per tab (sessionStorage): each tab can be signed in as a different user
  const session = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };

  async function post(path, body) {
    const s = session();
    try {
      const res = await fetch(path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' }, s ? { Authorization: 'Bearer ' + s.access_token } : {}), body: JSON.stringify(body || {}) });
      const out = await res.json().catch(() => ({}));
      if (res.status === 401 && s) sessionStorage.removeItem(KEY); // expired / revoked session
      return res.ok ? { data: out.data === undefined ? out : out.data, count: out.count == null ? null : out.count, error: null }
                    : { data: null, count: null, error: out.error && typeof out.error === 'object' ? out.error : { message: out.error || ('Request failed (' + res.status + ')') } };
    } catch (e) {
      return { data: null, count: null, error: { message: 'Cannot reach the portal server — is serve.py running?' } };
    }
  }

  class Query {
    constructor(table) { this.q = { table, op: 'select', filters: [], order: [], returning: false }; }
    select(cols, opts) {
      if (this.q.op === 'select') { this.q.count = !!(opts && opts.count); this.q.head = !!(opts && opts.head); } else this.q.returning = true;
      return this;
    }
    insert(values) { Object.assign(this.q, { op: 'insert', values }); return this; }
    upsert(values) { Object.assign(this.q, { op: 'upsert', values }); return this; }
    update(values) { Object.assign(this.q, { op: 'update', values }); return this; }
    delete() { this.q.op = 'delete'; return this; }
    eq(col, val) { this.q.filters.push([col, 'eq', val]); return this; }
    neq(col, val) { this.q.filters.push([col, 'neq', val]); return this; }
    in(col, vals) { this.q.filters.push([col, 'in', vals]); return this; }
    match(obj) { Object.keys(obj).forEach(k => this.eq(k, obj[k])); return this; }
    order(col, opts) { this.q.order.push([col, !(opts && opts.ascending === false)]); return this; }
    range(from, to) { this.q.range = [from, to]; return this; }
    limit(n) { this.q.range = [0, n - 1]; return this; }
    then(ok, fail) { if (this.q.op === 'select') this.q.returning = true; return post('/api/db', this.q).then(ok, fail); }
  }

  window.VITDB = {
    from: (table) => new Query(table),
    rpc: (name, args) => post('/api/rpc/' + name, args),
    auth: {
      async signInWithPassword({ email, password, role }) {
        const r = await post('/api/auth/login', { email, password, role });
        if (r.error) return { data: null, error: r.error };
        sessionStorage.setItem(KEY, JSON.stringify(r.data.session));
        return { data: { session: r.data.session }, error: null };
      },
      async getSession() { return { data: { session: session() }, error: null }; },
      async signOut() { if (session()) await post('/api/auth/logout'); sessionStorage.removeItem(KEY); return { error: null }; }
    }
  };
})();
