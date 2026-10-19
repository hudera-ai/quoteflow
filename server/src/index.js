// QuoteFlow API + static web app. Run with `npm start` (http://localhost:8788).
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";
import { ApiError, auth, company, services, clients, inquiries, quotations, followups, dashboard, auditLog } from "../../shared/service.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8788;
const dbx = await openDb();
const sessions = new Map();
const app = express();
app.use(express.json({ limit: "1mb" })); app.set("etag", false);
app.use("/api", (req, res, next) => { req.ctx = { user: sessions.get((req.headers.authorization || "").replace(/^Bearer\s+/i, "")) || null }; next(); });
const h = fn => async (req, res) => { try { res.json(await fn(req, res)); } catch (e) { if (e instanceof ApiError) return res.status(e.status).json({ error: e.code, message: e.message }); console.error(e); res.status(500).json({ error: "server_error", message: e.message }); } };
const id = s => parseInt(s, 10);

app.post("/api/auth/login", h(async req => { const r = await auth.login(dbx, req.body || {}); sessions.set(r.token, r.user); return r; }));
app.post("/api/auth/logout", h(req => { sessions.delete((req.headers.authorization || "").replace(/^Bearer\s+/i, "")); return { ok: true }; }));
app.get("/api/auth/me", h(req => { if (!req.ctx.user) throw new ApiError(401, "unauthenticated"); return req.ctx.user; }));
app.get("/api/users", h(req => auth.users(dbx, req.ctx)));
app.get("/api/company", h(() => company.get(dbx)));
app.patch("/api/company", h(req => company.update(dbx, req.ctx, req.body)));
app.get("/api/health", h(() => ({ ok: true, time: new Date().toISOString() })));

app.get("/api/services", h(req => services.list(dbx, req.ctx, { all: req.query.all === "1" })));
app.post("/api/services", h(req => services.create(dbx, req.ctx, req.body)));
app.patch("/api/services/:id", h(req => services.update(dbx, req.ctx, id(req.params.id), req.body)));

app.get("/api/clients", h(req => clients.list(dbx, req.ctx, req.query)));
app.post("/api/clients", h(req => clients.create(dbx, req.ctx, req.body)));
app.get("/api/clients/:id", h(req => clients.get(dbx, req.ctx, id(req.params.id))));
app.patch("/api/clients/:id", h(req => clients.update(dbx, req.ctx, id(req.params.id), req.body)));

app.get("/api/inquiries", h(req => inquiries.list(dbx, req.ctx, req.query)));
app.post("/api/inquiries", h(req => inquiries.create(dbx, req.ctx, req.body)));
app.get("/api/inquiries/:id", h(req => inquiries.get(dbx, req.ctx, id(req.params.id))));
app.patch("/api/inquiries/:id", h(req => inquiries.update(dbx, req.ctx, id(req.params.id), req.body)));
app.post("/api/inquiries/:id/assign", h(req => inquiries.assign(dbx, req.ctx, id(req.params.id), req.body)));
app.post("/api/inquiries/:id/respond", h(req => inquiries.respond(dbx, req.ctx, id(req.params.id), req.body || {})));
app.post("/api/inquiries/:id/status", h(req => inquiries.setStatus(dbx, req.ctx, id(req.params.id), req.body)));
app.post("/api/inquiries/:id/notes", h(req => inquiries.addNote(dbx, req.ctx, id(req.params.id), req.body)));
app.get("/api/inquiries/:id/draft", h(req => inquiries.draft(dbx, req.ctx, id(req.params.id))));

app.get("/api/quotations/:id", h(req => quotations.get(dbx, req.ctx, id(req.params.id))));
app.post("/api/quotations", h(req => quotations.create(dbx, req.ctx, req.body)));
app.patch("/api/quotations/:id", h(req => quotations.update(dbx, req.ctx, id(req.params.id), req.body)));
app.delete("/api/quotations/:id", h(req => quotations.remove(dbx, req.ctx, id(req.params.id))));
app.post("/api/quotations/:id/submit", h(req => quotations.submit(dbx, req.ctx, id(req.params.id))));
app.post("/api/quotations/:id/approve", h(req => quotations.approve(dbx, req.ctx, id(req.params.id))));
app.post("/api/quotations/:id/reject", h(req => quotations.reject(dbx, req.ctx, id(req.params.id), req.body || {})));
app.post("/api/quotations/:id/revise", h(req => quotations.revise(dbx, req.ctx, id(req.params.id))));

app.get("/api/followups", h(req => followups.list(dbx, req.ctx, req.query)));
app.post("/api/followups", h(req => followups.create(dbx, req.ctx, req.body)));
app.post("/api/followups/:id/complete", h(req => followups.complete(dbx, req.ctx, id(req.params.id), req.body || {})));

app.get("/api/dashboard", h(req => dashboard.summary(dbx, req.ctx)));
app.get("/api/reports", h(req => dashboard.reports(dbx, req.ctx, req.query)));
app.get("/api/audit", h(req => auditLog(dbx, req.ctx, id(req.query.limit || 100))));

// Inbound inquiry endpoint for website forms / WhatsApp automations (shared secret in INTAKE_TOKEN)
app.post("/intake", h(req => {
  if (process.env.INTAKE_TOKEN && req.headers["x-intake-token"] !== process.env.INTAKE_TOKEN) throw new ApiError(403, "forbidden");
  const b = req.body || {};
  let client = b.client_id ? dbx.get("SELECT id FROM clients WHERE id=?", [b.client_id]) : dbx.get("SELECT id FROM clients WHERE phone=? OR email=?", [b.phone || "", b.email || ""]);
  const sys = { user: dbx.get("SELECT id,name,role FROM users WHERE role='admin' LIMIT 1") };
  if (!client) client = clients.create(dbx, sys, { name_en: b.company || b.name || "Unknown", name_ar: b.company || b.name || "غير معروف", contact_name: b.name, phone: b.phone, email: b.email, type: b.type || "individual" });
  return inquiries.create(dbx, sys, { client_id: client.id, subject: b.subject || (b.message || "").slice(0, 80) || "Website inquiry", details: b.message, channel: b.channel || "portal", location: b.location, priority: b.priority || "normal" });
}));

const webRoot = path.join(here, "..", "..");
app.use("/shared", express.static(path.join(webRoot, "shared")));
app.use(express.static(webRoot, { index: "index.html", extensions: ["html"] }));
app.get("/{*path}", (req, res) => res.sendFile(path.join(webRoot, "index.html")));
app.listen(PORT, () => console.log(`QuoteFlow running on http://localhost:${PORT}`));
