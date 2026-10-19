// One client interface, two transports:
//  • http  — talks to the Node server (/api/...)
//  • local — runs the same service code against SQLite in the browser (sql.js + IndexedDB)
// The app never knows which one it is using. `?mode=local` or a GitHub Pages host forces local;
// otherwise we try the server and fall back to local if it isn't there.

import * as svc from "../shared/service.js";
import { wrap } from "../shared/dbx.js";
import { applySeed } from "../shared/seed.js";

export const MODE_KEY = "quoteflow.mode";
const TOKEN_KEY = "quoteflow.token";
const SESSION_KEY = "quoteflow.session";

// ---- http transport --------------------------------------------------------------
function httpClient(base = "") {
  let token = localStorage.getItem(TOKEN_KEY) || "";
  async function call(method, url, body) {
    const res = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || data.error || res.statusText), { status: res.status, code: data.error });
    return data;
  }
  const q = o => { const s = new URLSearchParams(Object.entries(o || {}).filter(([, v]) => v !== "" && v != null)).toString(); return s ? `?${s}` : ""; };
  return {
    mode: "http",
    async login(email, password) { const r = await call("POST", "/api/auth/login", { email, password }); token = r.token; localStorage.setItem(TOKEN_KEY, token); return r.user; },
    async logout() { try { await call("POST", "/api/auth/logout"); } catch {} token = ""; localStorage.removeItem(TOKEN_KEY); },
    me: () => call("GET", "/api/auth/me"), users: () => call("GET", "/api/users"), company: () => call("GET", "/api/company"), updateCompany: p => call("PATCH", "/api/company", p),
    dashboard: () => call("GET", "/api/dashboard"), reports: o => call("GET", `/api/reports${q(o)}`), audit: limit => call("GET", `/api/audit${q({ limit })}`),
    services: { list: o => call("GET", `/api/services${q(o)}`), create: s => call("POST", "/api/services", s), update: (id, s) => call("PATCH", `/api/services/${id}`, s) },
    clients: { list: o => call("GET", `/api/clients${q(o)}`), get: id => call("GET", `/api/clients/${id}`), create: c => call("POST", "/api/clients", c), update: (id, c) => call("PATCH", `/api/clients/${id}`, c) },
    inquiries: {
      list: o => call("GET", `/api/inquiries${q(o)}`), get: id => call("GET", `/api/inquiries/${id}`), create: p => call("POST", "/api/inquiries", p), update: (id, p) => call("PATCH", `/api/inquiries/${id}`, p),
      assign: (id, user_id) => call("POST", `/api/inquiries/${id}/assign`, { user_id }), respond: (id, note) => call("POST", `/api/inquiries/${id}/respond`, { note }), setStatus: (id, p) => call("POST", `/api/inquiries/${id}/status`, p), addNote: (id, text) => call("POST", `/api/inquiries/${id}/notes`, { text }), draft: id => call("GET", `/api/inquiries/${id}/draft`),
    },
    quotations: {
      get: id => call("GET", `/api/quotations/${id}`), create: p => call("POST", "/api/quotations", p), update: (id, p) => call("PATCH", `/api/quotations/${id}`, p), remove: id => call("DELETE", `/api/quotations/${id}`),
      submit: id => call("POST", `/api/quotations/${id}/submit`), approve: id => call("POST", `/api/quotations/${id}/approve`), reject: (id, comment) => call("POST", `/api/quotations/${id}/reject`, { comment }), revise: id => call("POST", `/api/quotations/${id}/revise`),
    },
    followups: { list: o => call("GET", `/api/followups${q(o)}`), create: p => call("POST", "/api/followups", p), complete: (id, outcome) => call("POST", `/api/followups/${id}/complete`, { outcome }) },
  };
}

// ---- local transport (sql.js in the browser) ------------------------------------------
const IDB = { name: "quoteflow", store: "db", key: "main" };
function idb() { return new Promise((ok, err) => { const r = indexedDB.open(IDB.name, 1); r.onupgradeneeded = () => r.result.createObjectStore(IDB.store); r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); }); }
async function idbGet() { try { const d = await idb(); return await new Promise((ok, err) => { const t = d.transaction(IDB.store).objectStore(IDB.store).get(IDB.key); t.onsuccess = () => ok(t.result); t.onerror = () => err(t.error); }); } catch { return null; } }
async function idbSet(bytes) { try { const d = await idb(); await new Promise((ok, err) => { const t = d.transaction(IDB.store, "readwrite").objectStore(IDB.store).put(bytes, IDB.key); t.onsuccess = ok; t.onerror = () => err(t.error); }); } catch {} }

async function localClient() {
  const SQL = await window.initSqlJs({ locateFile: f => `vendor/${f}` });
  const schema = await (await fetch("db/schema.sql")).text();
  const saved = await idbGet();
  const db = new SQL.Database(saved ? new Uint8Array(saved) : undefined);
  const dbx = wrap(db);
  dbx.exec(schema);
  if (!dbx.get("SELECT 1 FROM company")) applySeed(dbx);
  let t = null; const persist = () => { clearTimeout(t); t = setTimeout(() => idbSet(dbx.export()), 300); };
  for (const m of ["run", "exec", "tx"]) { const o = dbx[m]; dbx[m] = (...a) => { const r = o(...a); persist(); return r; }; }
  persist();

  let ctx = { user: JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") };
  const wrapErr = fn => async (...a) => { try { return await fn(...a); } catch (e) { if (e instanceof svc.ApiError) throw Object.assign(new Error(e.message), { status: e.status, code: e.code }); throw e; } };
  const W = o => Object.fromEntries(Object.entries(o).map(([k, f]) => [k, wrapErr(f)]));
  return {
    mode: "local",
    ...W({
      async login(email, password) { const r = await svc.auth.login(dbx, { email, password }); ctx = { user: r.user }; sessionStorage.setItem(SESSION_KEY, JSON.stringify(r.user)); return r.user; },
      async logout() { ctx = { user: null }; sessionStorage.removeItem(SESSION_KEY); },
      async me() { if (!ctx.user) throw new svc.ApiError(401, "unauthenticated"); return ctx.user; },
      users: () => svc.auth.users(dbx, ctx), company: () => svc.company.get(dbx), updateCompany: p => svc.company.update(dbx, ctx, p),
      dashboard: () => svc.dashboard.summary(dbx, ctx), reports: o => svc.dashboard.reports(dbx, ctx, o || {}), audit: limit => svc.auditLog(dbx, ctx, limit),
      async reset() { applySeed(dbx); },
    }),
    services: W({ list: o => svc.services.list(dbx, ctx, { all: o?.all === "1" || o?.all === true }), create: s => svc.services.create(dbx, ctx, s), update: (id, s) => svc.services.update(dbx, ctx, +id, s) }),
    clients: W({ list: o => svc.clients.list(dbx, ctx, o || {}), get: id => svc.clients.get(dbx, ctx, +id), create: c => svc.clients.create(dbx, ctx, c), update: (id, c) => svc.clients.update(dbx, ctx, +id, c) }),
    inquiries: W({
      list: o => svc.inquiries.list(dbx, ctx, o || {}), get: id => svc.inquiries.get(dbx, ctx, +id), create: p => svc.inquiries.create(dbx, ctx, p), update: (id, p) => svc.inquiries.update(dbx, ctx, +id, p),
      assign: (id, user_id) => svc.inquiries.assign(dbx, ctx, +id, { user_id: +user_id }), respond: (id, note) => svc.inquiries.respond(dbx, ctx, +id, { note }), setStatus: (id, p) => svc.inquiries.setStatus(dbx, ctx, +id, p), addNote: (id, text) => svc.inquiries.addNote(dbx, ctx, +id, { text }), draft: id => svc.inquiries.draft(dbx, ctx, +id),
    }),
    quotations: W({
      get: id => svc.quotations.get(dbx, ctx, +id), create: p => svc.quotations.create(dbx, ctx, p), update: (id, p) => svc.quotations.update(dbx, ctx, +id, p), remove: id => svc.quotations.remove(dbx, ctx, +id),
      submit: id => svc.quotations.submit(dbx, ctx, +id), approve: id => svc.quotations.approve(dbx, ctx, +id), reject: (id, comment) => svc.quotations.reject(dbx, ctx, +id, { comment }), revise: id => svc.quotations.revise(dbx, ctx, +id),
    }),
    followups: W({ list: o => svc.followups.list(dbx, ctx, o || {}), create: p => svc.followups.create(dbx, ctx, p), complete: (id, outcome) => svc.followups.complete(dbx, ctx, +id, { outcome }) }),
  };
}

export async function createApi() {
  const params = new URLSearchParams(location.search);
  const forced = params.get("mode") || localStorage.getItem(MODE_KEY);
  const onPages = /github\.io$/.test(location.hostname) || location.protocol === "file:";
  if (forced === "local" || (onPages && forced !== "http")) return localClient();
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    if (r.ok) return httpClient();
  } catch {}
  return localClient();
}
