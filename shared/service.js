// Domain service for QuoteFlow — used by the REST server and by the browser demo.
import { verifyPassword, randomToken } from "./auth.js";
import { draftItems, computeTotals, slaState, hoursBetween, SLA_HOURS } from "./estimator.js";

export class ApiError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const today = () => new Date().toISOString().slice(0, 10);
const num = v => (v === "" || v == null ? 0 : Number(v));
const ROLE_RANK = { sales: 1, estimator: 1, manager: 2, admin: 3 };
function require(ctx, minRole) {
  if (!ctx?.user) throw new ApiError(401, "unauthenticated");
  if (ROLE_RANK[ctx.user.role] < ROLE_RANK[minRole]) throw new ApiError(403, "forbidden", `Requires role ${minRole}`);
}
function audit(dbx, ctx, action, entity, entityId, detail) { dbx.run("INSERT INTO audit_log (user_id,action,entity,entity_id,detail) VALUES (?,?,?,?,?)", [ctx?.user?.id ?? null, action, entity, entityId ?? null, detail ? JSON.stringify(detail).slice(0, 500) : null]); }
function activity(dbx, ctx, inquiryId, type, text) { dbx.run("INSERT INTO activity (inquiry_id,user_id,type,text) VALUES (?,?,?,?)", [inquiryId, ctx?.user?.id ?? null, type, text]); dbx.run("UPDATE inquiries SET updated_at=? WHERE id=?", [now(), inquiryId]); }

export const OPEN_STATUSES = ["new", "assigned", "site_visit", "quoting", "quoted", "negotiation"];

export const auth = {
  async login(dbx, { email, password }) {
    const u = dbx.get("SELECT * FROM users WHERE lower(email)=lower(?) AND active=1", [String(email || "").trim()]);
    if (!u || !(await verifyPassword(String(password || ""), u.password_hash))) throw new ApiError(401, "bad_credentials", "Wrong email or password");
    const { password_hash, ...user } = u; return { token: randomToken(), user };
  },
  users(dbx, ctx) { require(ctx, "sales"); return dbx.all("SELECT id,name,email,phone,role,active FROM users ORDER BY role, name"); },
};
export const company = {
  get(dbx) { return dbx.get("SELECT * FROM company WHERE id=1"); },
  update(dbx, ctx, p) { require(ctx, "admin"); const f = ["name_ar", "name_en", "cr_no", "vat_no", "city", "address", "phone", "email", "bank_name", "iban", "quote_terms", "quote_validity_days", "vat_rate"].filter(k => k in p); if (f.length) dbx.run(`UPDATE company SET ${f.map(k => `${k}=?`).join(",")} WHERE id=1`, f.map(k => p[k])); audit(dbx, ctx, "update", "company", 1, f); return company.get(dbx); },
};

export const services = {
  list(dbx, ctx, { all = false } = {}) { require(ctx, "sales"); return dbx.all(`SELECT * FROM services ${all ? "" : "WHERE active=1"} ORDER BY category, code`); },
  create(dbx, ctx, s) { require(ctx, "manager"); if (!s.code || !s.name_en || !s.unit) throw new ApiError(400, "validation", "code, name_en and unit are required"); const r = dbx.run("INSERT INTO services (code,name_ar,name_en,category,unit,base_rate) VALUES (?,?,?,?,?,?)", [s.code, s.name_ar || s.name_en, s.name_en, s.category || "general", s.unit, num(s.base_rate)]); audit(dbx, ctx, "create", "service", r.lastId); return dbx.get("SELECT * FROM services WHERE id=?", [r.lastId]); },
  update(dbx, ctx, id, s) { require(ctx, "manager"); const f = ["code", "name_ar", "name_en", "category", "unit", "base_rate", "active"].filter(k => k in s); dbx.run(`UPDATE services SET ${f.map(k => `${k}=?`).join(",")} WHERE id=?`, [...f.map(k => s[k]), id]); audit(dbx, ctx, "update", "service", id, f); return dbx.get("SELECT * FROM services WHERE id=?", [id]); },
};

export const clients = {
  list(dbx, ctx, { search = "" } = {}) {
    require(ctx, "sales");
    return dbx.all(`SELECT c.*, (SELECT COUNT(*) FROM inquiries i WHERE i.client_id=c.id) AS inquiries, (SELECT COUNT(*) FROM inquiries i WHERE i.client_id=c.id AND i.status='won') AS won,
      (SELECT COALESCE(SUM(q.total),0) FROM quotations q JOIN inquiries i ON i.id=q.inquiry_id WHERE i.client_id=c.id AND q.status='accepted') AS won_value,
      (SELECT MAX(received_at) FROM inquiries i WHERE i.client_id=c.id) AS last_inquiry FROM clients c ${search ? "WHERE c.name_en LIKE ? OR c.name_ar LIKE ? OR c.contact_name LIKE ?" : ""} ORDER BY last_inquiry DESC NULLS LAST, c.name_en`, search ? [`%${search}%`, `%${search}%`, `%${search}%`] : []);
  },
  get(dbx, ctx, id) { require(ctx, "sales"); const c = dbx.get("SELECT * FROM clients WHERE id=?", [id]); if (!c) throw new ApiError(404, "client_not_found"); return { ...c, inquiries: inquiries.list(dbx, ctx, { client_id: id, limit: 100 }).rows }; },
  create(dbx, ctx, c) { require(ctx, "sales"); if (!c.name_en && !c.name_ar) throw new ApiError(400, "validation", "name is required"); const r = dbx.run("INSERT INTO clients (name_ar,name_en,type,city,contact_name,phone,email,vat_no,notes) VALUES (?,?,?,?,?,?,?,?,?)", [c.name_ar || c.name_en, c.name_en || c.name_ar, c.type || "contractor", c.city || null, c.contact_name || null, c.phone || null, c.email || null, c.vat_no || null, c.notes || null]); audit(dbx, ctx, "create", "client", r.lastId); return dbx.get("SELECT * FROM clients WHERE id=?", [r.lastId]); },
  update(dbx, ctx, id, c) { require(ctx, "sales"); const f = ["name_ar", "name_en", "type", "city", "contact_name", "phone", "email", "vat_no", "notes"].filter(k => k in c); if (f.length) dbx.run(`UPDATE clients SET ${f.map(k => `${k}=?`).join(",")} WHERE id=?`, [...f.map(k => c[k]), id]); audit(dbx, ctx, "update", "client", id, f); return dbx.get("SELECT * FROM clients WHERE id=?", [id]); },
};

const INQ_SELECT = `SELECT i.*, c.name_en AS client_name_en, c.name_ar AS client_name_ar, c.type AS client_type, c.contact_name, c.phone AS client_phone, u.name AS assigned_name,
  (SELECT COUNT(*) FROM quotations q WHERE q.inquiry_id=i.id) AS quotes,
  (SELECT q.total FROM quotations q WHERE q.inquiry_id=i.id AND q.status<>'superseded' ORDER BY q.revision DESC, q.id DESC LIMIT 1) AS quote_total,
  (SELECT q.status FROM quotations q WHERE q.inquiry_id=i.id AND q.status<>'superseded' ORDER BY q.revision DESC, q.id DESC LIMIT 1) AS quote_status,
  (SELECT MIN(due_at) FROM followups f WHERE f.inquiry_id=i.id AND f.done_at IS NULL) AS next_followup
  FROM inquiries i JOIN clients c ON c.id=i.client_id LEFT JOIN users u ON u.id=i.assigned_to`;
function decorate(i) { return { ...i, sla: slaState(i), response_hours: hoursBetween(i.received_at, i.first_response_at), quote_hours: hoursBetween(i.received_at, i.quoted_at) }; }

export const inquiries = {
  list(dbx, ctx, q = {}) {
    require(ctx, "sales");
    const where = [], params = [];
    if (q.status === "open") where.push(`i.status IN (${OPEN_STATUSES.map(s => `'${s}'`).join(",")})`); else if (q.status) { where.push("i.status=?"); params.push(q.status); }
    if (q.client_id) { where.push("i.client_id=?"); params.push(q.client_id); }
    if (q.assigned_to) { where.push("i.assigned_to=?"); params.push(q.assigned_to); }
    if (q.priority) { where.push("i.priority=?"); params.push(q.priority); }
    if (q.from) { where.push("i.received_at>=?"); params.push(q.from); }
    if (q.to) { where.push("i.received_at<=?"); params.push(q.to + " 23:59:59"); }
    if (q.search) { where.push("(i.inq_no LIKE ? OR i.subject LIKE ? OR c.name_en LIKE ? OR c.name_ar LIKE ? OR i.location LIKE ?)"); params.push(...Array(5).fill(`%${q.search}%`)); }
    const limit = Math.min(num(q.limit) || 50, 500), offset = num(q.offset);
    const w = where.length ? "WHERE " + where.join(" AND ") : "";
    const total = dbx.get(`SELECT COUNT(*) AS n FROM inquiries i JOIN clients c ON c.id=i.client_id ${w}`, params).n;
    const rows = dbx.all(`${INQ_SELECT} ${w} ORDER BY i.received_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]).map(decorate);
    return { total, rows };
  },
  get(dbx, ctx, id) {
    require(ctx, "sales");
    const i = dbx.get(`${INQ_SELECT} WHERE i.id=?`, [id]); if (!i) throw new ApiError(404, "inquiry_not_found");
    return { ...decorate(i), quotations: dbx.all("SELECT q.*, u.name AS prepared_by_name FROM quotations q LEFT JOIN users u ON u.id=q.prepared_by WHERE q.inquiry_id=? ORDER BY q.revision DESC, q.id DESC", [id]),
      followups: dbx.all("SELECT f.*, u.name AS user_name FROM followups f LEFT JOIN users u ON u.id=f.user_id WHERE f.inquiry_id=? ORDER BY f.done_at IS NOT NULL, f.due_at", [id]),
      activity: dbx.all("SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id=a.user_id WHERE a.inquiry_id=? ORDER BY a.at DESC, a.id DESC", [id]) };
  },
  create(dbx, ctx, p) {
    require(ctx, "sales");
    if (!p.client_id || !p.subject) throw new ApiError(400, "validation", "client_id and subject are required");
    const y = new Date().getFullYear();
    const seq = dbx.get("SELECT COUNT(*) AS n FROM inquiries WHERE inq_no LIKE ?", [`INQ-${y}-%`]).n + 1;
    const priority = p.priority || "normal";
    const r = dbx.run("INSERT INTO inquiries (inq_no,client_id,received_at,channel,subject,details,location,required_by,priority,status,assigned_to,sla_hours,first_response_at,est_value,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [`INQ-${y}-${String(seq).padStart(4, "0")}`, p.client_id, p.received_at || now(), p.channel || "whatsapp", p.subject, p.details || null, p.location || null, p.required_by || null, priority, p.assigned_to ? "assigned" : "new", p.assigned_to || null, SLA_HOURS[priority] || 48, p.assigned_to ? now() : null, num(p.est_value), ctx.user.id]);
    activity(dbx, ctx, r.lastId, "received", `Inquiry received via ${p.channel || "whatsapp"}`);
    if (p.assigned_to) activity(dbx, ctx, r.lastId, "assigned", `Assigned to ${dbx.get("SELECT name FROM users WHERE id=?", [p.assigned_to])?.name}`);
    audit(dbx, ctx, "create", "inquiry", r.lastId); return inquiries.get(dbx, ctx, r.lastId);
  },
  update(dbx, ctx, id, p) {
    require(ctx, "sales"); if (!dbx.get("SELECT 1 FROM inquiries WHERE id=?", [id])) throw new ApiError(404, "inquiry_not_found");
    const f = ["client_id", "channel", "subject", "details", "location", "required_by", "priority", "est_value", "received_at"].filter(k => k in p);
    if (f.length) dbx.run(`UPDATE inquiries SET ${[...f.map(k => `${k}=?`), "updated_at=?"].join(",")} WHERE id=?`, [...f.map(k => p[k]), now(), id]);
    if ("priority" in p) dbx.run("UPDATE inquiries SET sla_hours=? WHERE id=?", [SLA_HOURS[p.priority] || 48, id]);
    audit(dbx, ctx, "update", "inquiry", id, f); return inquiries.get(dbx, ctx, id);
  },
  assign(dbx, ctx, id, { user_id }) {
    require(ctx, "sales"); const u = dbx.get("SELECT name FROM users WHERE id=?", [user_id]); if (!u) throw new ApiError(400, "validation", "unknown user");
    const i = dbx.get("SELECT * FROM inquiries WHERE id=?", [id]); if (!i) throw new ApiError(404, "inquiry_not_found");
    dbx.run("UPDATE inquiries SET assigned_to=?, status=CASE WHEN status='new' THEN 'assigned' ELSE status END, first_response_at=COALESCE(first_response_at,?), updated_at=? WHERE id=?", [user_id, now(), now(), id]);
    activity(dbx, ctx, id, "assigned", `Assigned to ${u.name}`); audit(dbx, ctx, "assign", "inquiry", id, { user_id }); return inquiries.get(dbx, ctx, id);
  },
  respond(dbx, ctx, id, { note } = {}) { // first contact with the client → stops the SLA clock
    require(ctx, "sales"); dbx.run("UPDATE inquiries SET first_response_at=COALESCE(first_response_at,?), status=CASE WHEN status='new' THEN 'assigned' ELSE status END, assigned_to=COALESCE(assigned_to,?), updated_at=? WHERE id=?", [now(), ctx.user.id, now(), id]);
    activity(dbx, ctx, id, "responded", note || "Client contacted"); return inquiries.get(dbx, ctx, id);
  },
  setStatus(dbx, ctx, id, { status, reason, note }) {
    require(ctx, "sales");
    const i = dbx.get("SELECT * FROM inquiries WHERE id=?", [id]); if (!i) throw new ApiError(404, "inquiry_not_found");
    if (!["new", "assigned", "site_visit", "quoting", "quoted", "negotiation", "won", "lost", "cancelled"].includes(status)) throw new ApiError(400, "validation", "bad status");
    if (status === "lost" && !reason) throw new ApiError(400, "validation", "A reason is required when marking an inquiry lost");
    if (["won", "lost"].includes(status) && !dbx.get("SELECT 1 FROM quotations WHERE inquiry_id=? AND status IN ('sent','accepted','rejected')", [id])) throw new ApiError(409, "no_quote", "Send a quotation before closing the inquiry as won/lost");
    const closed = ["won", "lost", "cancelled"].includes(status) ? now() : null;
    dbx.run("UPDATE inquiries SET status=?, closed_at=?, lost_reason=?, updated_at=? WHERE id=?", [status, closed, status === "lost" ? reason : null, now(), id]);
    if (status === "won") dbx.run("UPDATE quotations SET status='accepted', decided_at=? WHERE inquiry_id=? AND status='sent'", [now(), id]);
    if (status === "lost") dbx.run("UPDATE quotations SET status='rejected', decided_at=? WHERE inquiry_id=? AND status='sent'", [now(), id]);
    activity(dbx, ctx, id, status, note || (status === "lost" ? `Lost: ${reason}` : `Status → ${status}`)); audit(dbx, ctx, "status", "inquiry", id, { status });
    return inquiries.get(dbx, ctx, id);
  },
  addNote(dbx, ctx, id, { text }) { require(ctx, "sales"); if (!text) throw new ApiError(400, "validation", "text required"); activity(dbx, ctx, id, "note", text); return inquiries.get(dbx, ctx, id); },
  draft(dbx, ctx, id) { require(ctx, "sales"); const i = dbx.get("SELECT * FROM inquiries WHERE id=?", [id]); if (!i) throw new ApiError(404, "inquiry_not_found"); return draftItems(`${i.subject}. ${i.details || ""}`, services.list(dbx, ctx)); },
};

export const quotations = {
  get(dbx, ctx, id) {
    require(ctx, "sales");
    const q = dbx.get("SELECT q.*, u.name AS prepared_by_name, a.name AS approved_by_name, i.inq_no, i.subject, i.location, i.client_id, c.name_en AS client_name_en, c.name_ar AS client_name_ar, c.contact_name, c.phone AS client_phone, c.email AS client_email, c.city AS client_city, c.vat_no AS client_vat FROM quotations q JOIN inquiries i ON i.id=q.inquiry_id JOIN clients c ON c.id=i.client_id LEFT JOIN users u ON u.id=q.prepared_by LEFT JOIN users a ON a.id=q.approved_by WHERE q.id=?", [id]);
    if (!q) throw new ApiError(404, "quotation_not_found");
    q.items = dbx.all("SELECT qi.*, s.code AS service_code FROM quotation_items qi LEFT JOIN services s ON s.id=qi.service_id WHERE quotation_id=? ORDER BY sort, id", [id]);
    q.can_edit = q.status === "draft" || (q.status === "pending_approval" && ROLE_RANK[ctx.user.role] >= 2);
    return q;
  },
  create(dbx, ctx, { inquiry_id, items, auto = true }) {
    require(ctx, "sales");
    const i = dbx.get("SELECT * FROM inquiries WHERE id=?", [inquiry_id]); if (!i) throw new ApiError(404, "inquiry_not_found");
    const c = company.get(dbx);
    const y = new Date().getFullYear();
    const seq = dbx.get("SELECT COUNT(DISTINCT quote_no) AS n FROM quotations WHERE quote_no LIKE ?", [`QT-${y}-%`]).n + 1;
    const valid = new Date(); valid.setDate(valid.getDate() + (c.quote_validity_days || 30));
    const lines = items?.length ? items : auto ? draftItems(`${i.subject}. ${i.details || ""}`, services.list(dbx, ctx)) : [];
    const tot = computeTotals(lines, { discount_pct: 0, vat_rate: c.vat_rate });
    const r = dbx.run("INSERT INTO quotations (quote_no,revision,inquiry_id,status,valid_until,vat_rate,discount_pct,subtotal,discount,vat,total,scope_notes,terms,prepared_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [`QT-${y}-${String(seq).padStart(4, "0")}`, 0, inquiry_id, "draft", valid.toISOString().slice(0, 10), c.vat_rate, 0, tot.subtotal, tot.discount, tot.vat, tot.total, i.details ? i.details.slice(0, 300) : null, c.quote_terms, ctx.user.id]);
    tot.lines.forEach((l, k) => dbx.run("INSERT INTO quotation_items (quotation_id,service_id,description,unit,qty,rate,amount,sort) VALUES (?,?,?,?,?,?,?,?)", [r.lastId, l.service_id ?? null, l.description, l.unit, num(l.qty), num(l.rate), l.amount, k]));
    dbx.run("UPDATE inquiries SET status=CASE WHEN status IN ('new','assigned','site_visit') THEN 'quoting' ELSE status END, updated_at=? WHERE id=?", [now(), inquiry_id]);
    activity(dbx, ctx, inquiry_id, "quote_draft", `Quotation draft created (${lines.length} lines)`); audit(dbx, ctx, "create", "quotation", r.lastId);
    return quotations.get(dbx, ctx, r.lastId);
  },
  update(dbx, ctx, id, p) {
    require(ctx, "sales");
    const q = dbx.get("SELECT * FROM quotations WHERE id=?", [id]); if (!q) throw new ApiError(404, "quotation_not_found");
    if (!(q.status === "draft" || (q.status === "pending_approval" && ROLE_RANK[ctx.user.role] >= 2))) throw new ApiError(409, "locked", `Quotation is ${q.status}; create a revision to change it`);
    const items = Array.isArray(p.items) ? p.items.filter(l => l.description) : dbx.all("SELECT * FROM quotation_items WHERE quotation_id=? ORDER BY sort,id", [id]);
    const tot = computeTotals(items, { discount_pct: "discount_pct" in p ? num(p.discount_pct) : q.discount_pct, vat_rate: q.vat_rate });
    dbx.tx(() => {
      const f = ["discount_pct", "scope_notes", "terms", "internal_notes", "valid_until"].filter(k => k in p);
      dbx.run(`UPDATE quotations SET ${[...f.map(k => `${k}=?`), "subtotal=?", "discount=?", "vat=?", "total=?", "updated_at=?"].join(",")} WHERE id=?`, [...f.map(k => p[k]), tot.subtotal, tot.discount, tot.vat, tot.total, now(), id]);
      if (Array.isArray(p.items)) { dbx.run("DELETE FROM quotation_items WHERE quotation_id=?", [id]); tot.lines.forEach((l, k) => dbx.run("INSERT INTO quotation_items (quotation_id,service_id,description,unit,qty,rate,amount,sort) VALUES (?,?,?,?,?,?,?,?)", [id, l.service_id || null, l.description, l.unit || "ls", num(l.qty), num(l.rate), l.amount, k])); }
      dbx.run("UPDATE inquiries SET est_value=?, updated_at=? WHERE id=?", [tot.total, now(), q.inquiry_id]);
    });
    audit(dbx, ctx, "update", "quotation", id, Object.keys(p)); return quotations.get(dbx, ctx, id);
  },
  submit(dbx, ctx, id) { require(ctx, "sales"); const q = quotations.get(dbx, ctx, id); if (q.status !== "draft") throw new ApiError(409, "bad_state"); if (!q.items.length) throw new ApiError(400, "empty", "Add at least one line"); dbx.run("UPDATE quotations SET status='pending_approval', updated_at=? WHERE id=?", [now(), id]); activity(dbx, ctx, q.inquiry_id, "quote_pending", `${q.quote_no} submitted for approval · ${q.total.toLocaleString("en-US")} SAR`); return quotations.get(dbx, ctx, id); },
  approve(dbx, ctx, id) { require(ctx, "manager"); const q = quotations.get(dbx, ctx, id); if (!["pending_approval", "draft"].includes(q.status)) throw new ApiError(409, "bad_state"); if (!q.items.length) throw new ApiError(400, "empty", "Add at least one line"); dbx.run("UPDATE quotations SET status='sent', approved_by=?, approved_at=?, issued_at=?, sent_at=?, updated_at=? WHERE id=?", [ctx.user.id, now(), today(), now(), now(), id]); dbx.run("UPDATE quotations SET status='superseded' WHERE inquiry_id=? AND id<>? AND status IN ('sent','draft','pending_approval')", [q.inquiry_id, id]); dbx.run("UPDATE inquiries SET status='quoted', quoted_at=COALESCE(quoted_at,?), est_value=?, first_response_at=COALESCE(first_response_at,?), updated_at=? WHERE id=?", [now(), q.total, now(), now(), q.inquiry_id]); activity(dbx, ctx, q.inquiry_id, "quoted", `${q.quote_no}${q.revision ? " R" + q.revision : ""} approved & sent · ${q.total.toLocaleString("en-US")} SAR`); audit(dbx, ctx, "approve", "quotation", id); return quotations.get(dbx, ctx, id); },
  reject(dbx, ctx, id, { comment }) { require(ctx, "manager"); const q = quotations.get(dbx, ctx, id); if (q.status !== "pending_approval") throw new ApiError(409, "bad_state"); dbx.run("UPDATE quotations SET status='draft', internal_notes=?, updated_at=? WHERE id=?", [`[Manager] ${comment || "Please revise"}\n${q.internal_notes || ""}`.trim(), now(), id]); activity(dbx, ctx, q.inquiry_id, "quote_returned", `${q.quote_no} returned: ${comment || "please revise"}`); return quotations.get(dbx, ctx, id); },
  revise(dbx, ctx, id) {
    require(ctx, "sales"); const q = quotations.get(dbx, ctx, id); if (!["sent", "rejected", "expired"].includes(q.status)) throw new ApiError(409, "bad_state", "Only sent/rejected/expired quotations can be revised");
    const rev = dbx.get("SELECT MAX(revision) AS r FROM quotations WHERE quote_no=?", [q.quote_no]).r + 1;
    const r = dbx.run("INSERT INTO quotations (quote_no,revision,inquiry_id,status,valid_until,vat_rate,discount_pct,subtotal,discount,vat,total,scope_notes,terms,internal_notes,prepared_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [q.quote_no, rev, q.inquiry_id, "draft", q.valid_until, q.vat_rate, q.discount_pct, q.subtotal, q.discount, q.vat, q.total, q.scope_notes, q.terms, q.internal_notes, ctx.user.id]);
    q.items.forEach((l, k) => dbx.run("INSERT INTO quotation_items (quotation_id,service_id,description,unit,qty,rate,amount,sort) VALUES (?,?,?,?,?,?,?,?)", [r.lastId, l.service_id, l.description, l.unit, l.qty, l.rate, l.amount, k]));
    dbx.run("UPDATE quotations SET status='superseded' WHERE id=?", [id]);
    dbx.run("UPDATE inquiries SET status='negotiation', updated_at=? WHERE id=? AND status IN ('quoted','negotiation')", [now(), q.inquiry_id]);
    activity(dbx, ctx, q.inquiry_id, "quote_revision", `${q.quote_no} revision R${rev} started`); return quotations.get(dbx, ctx, r.lastId);
  },
  remove(dbx, ctx, id) { require(ctx, "sales"); const q = quotations.get(dbx, ctx, id); if (q.status !== "draft") throw new ApiError(409, "locked"); dbx.run("DELETE FROM quotations WHERE id=?", [id]); audit(dbx, ctx, "delete", "quotation", id); return { ok: true }; },
};

export const followups = {
  list(dbx, ctx, { scope = "open", user_id } = {}) {
    require(ctx, "sales");
    const where = ["1=1"], params = [];
    if (scope === "open") where.push("f.done_at IS NULL"); if (scope === "overdue") { where.push("f.done_at IS NULL AND f.due_at < ?"); params.push(now()); } if (scope === "today") { where.push("f.done_at IS NULL AND date(f.due_at)=date(?)"); params.push(now()); } if (scope === "done") where.push("f.done_at IS NOT NULL");
    if (user_id) { where.push("f.user_id=?"); params.push(user_id); }
    return dbx.all(`SELECT f.*, u.name AS user_name, i.inq_no, i.subject, i.status AS inquiry_status, c.name_en AS client_name_en, c.name_ar AS client_name_ar, c.phone AS client_phone FROM followups f JOIN inquiries i ON i.id=f.inquiry_id JOIN clients c ON c.id=i.client_id LEFT JOIN users u ON u.id=f.user_id WHERE ${where.join(" AND ")} ORDER BY f.due_at LIMIT 300`, params);
  },
  create(dbx, ctx, p) { require(ctx, "sales"); if (!p.inquiry_id || !p.due_at) throw new ApiError(400, "validation", "inquiry_id and due_at are required"); const r = dbx.run("INSERT INTO followups (inquiry_id,due_at,type,note,user_id) VALUES (?,?,?,?,?)", [p.inquiry_id, p.due_at.length === 10 ? p.due_at + " 09:00:00" : p.due_at, p.type || "call", p.note || null, p.user_id || ctx.user.id]); activity(dbx, ctx, p.inquiry_id, "followup", `Follow-up scheduled (${p.type || "call"}) for ${p.due_at}`); return dbx.get("SELECT * FROM followups WHERE id=?", [r.lastId]); },
  complete(dbx, ctx, id, { outcome } = {}) { require(ctx, "sales"); const f = dbx.get("SELECT * FROM followups WHERE id=?", [id]); if (!f) throw new ApiError(404, "followup_not_found"); dbx.run("UPDATE followups SET done_at=?, outcome=? WHERE id=?", [now(), outcome || null, id]); dbx.run("UPDATE inquiries SET first_response_at=COALESCE(first_response_at,?) WHERE id=?", [now(), f.inquiry_id]); activity(dbx, ctx, f.inquiry_id, "followup_done", `${f.type}: ${outcome || "done"}`); return dbx.get("SELECT * FROM followups WHERE id=?", [id]); },
};

export const dashboard = {
  summary(dbx, ctx) {
    require(ctx, "sales");
    const open = inquiries.list(dbx, ctx, { status: "open", limit: 500 }).rows;
    const overdue = open.filter(i => i.sla.overdue), atRisk = open.filter(i => i.sla.at_risk);
    const pendingApproval = dbx.get("SELECT COUNT(*) AS n FROM quotations WHERE status='pending_approval'").n;
    const fuToday = followups.list(dbx, ctx, { scope: "today" }), fuOverdue = followups.list(dbx, ctx, { scope: "overdue" });
    const pipeline = ["new", "assigned", "site_visit", "quoting", "quoted", "negotiation"].map(s => ({ status: s, count: open.filter(i => i.status === s).length, value: open.filter(i => i.status === s).reduce((a, b) => a + (b.quote_total || b.est_value || 0), 0) }));
    const m0 = today().slice(0, 7);
    const wonMonth = dbx.get("SELECT COUNT(*) AS n, COALESCE(SUM(q.total),0) AS v FROM inquiries i JOIN quotations q ON q.inquiry_id=i.id AND q.status='accepted' WHERE i.status='won' AND substr(i.closed_at,1,7)=?", [m0]);
    const last90 = dbx.get("SELECT SUM(status='won') AS won, SUM(status='lost') AS lost FROM inquiries WHERE closed_at >= date('now','-90 day')");
    const resp = dbx.get("SELECT AVG((julianday(first_response_at)-julianday(received_at))*24) AS h FROM inquiries WHERE first_response_at IS NOT NULL AND received_at >= date('now','-90 day')").h;
    const qt = dbx.get("SELECT AVG((julianday(quoted_at)-julianday(received_at))*24) AS h FROM inquiries WHERE quoted_at IS NOT NULL AND received_at >= date('now','-90 day')").h;
    const monthly = dbx.all(`SELECT substr(received_at,1,7) AS m, COUNT(*) AS received, SUM(quoted_at IS NOT NULL) AS quoted, SUM(status='won') AS won, COALESCE(SUM(CASE WHEN status='won' THEN est_value END),0) AS won_value FROM inquiries WHERE received_at >= date('now','-6 month') GROUP BY m ORDER BY m`);
    const channels = dbx.all("SELECT channel, COUNT(*) AS n FROM inquiries WHERE received_at >= date('now','-90 day') GROUP BY channel ORDER BY n DESC");
    return { open_count: open.length, overdue: overdue.slice(0, 10), overdue_count: overdue.length, at_risk_count: atRisk.length, pending_approval: pendingApproval, followups_today: fuToday, followups_overdue: fuOverdue, pipeline,
      won_month: wonMonth, win_rate: (last90.won + last90.lost) ? +(100 * last90.won / (last90.won + last90.lost)).toFixed(0) : null, avg_response_h: resp ? +resp.toFixed(1) : null, avg_quote_h: qt ? +qt.toFixed(1) : null, monthly, channels, recent: open.slice(0, 8) };
  },
  reports(dbx, ctx, { from, to } = {}) {
    require(ctx, "sales");
    const f = from || new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10), t = (to || today()) + " 23:59:59";
    const funnel = dbx.get("SELECT COUNT(*) AS received, SUM(first_response_at IS NOT NULL) AS responded, SUM(quoted_at IS NOT NULL) AS quoted, SUM(status='won') AS won, SUM(status='lost') AS lost, SUM(status='cancelled') AS cancelled FROM inquiries WHERE received_at BETWEEN ? AND ?", [f, t]);
    const bySales = dbx.all("SELECT u.name, COUNT(*) AS inquiries, SUM(i.status='won') AS won, SUM(i.status='lost') AS lost, COALESCE(SUM(CASE WHEN i.status='won' THEN i.est_value END),0) AS won_value, AVG((julianday(i.first_response_at)-julianday(i.received_at))*24) AS resp_h FROM inquiries i JOIN users u ON u.id=i.assigned_to WHERE i.received_at BETWEEN ? AND ? GROUP BY u.id ORDER BY won_value DESC", [f, t]);
    const byType = dbx.all("SELECT c.type, COUNT(*) AS inquiries, SUM(i.status='won') AS won, COALESCE(SUM(CASE WHEN i.status='won' THEN i.est_value END),0) AS won_value FROM inquiries i JOIN clients c ON c.id=i.client_id WHERE i.received_at BETWEEN ? AND ? GROUP BY c.type ORDER BY won_value DESC", [f, t]);
    const byService = dbx.all("SELECT s.code, s.name_en, s.name_ar, SUM(qi.qty) AS qty, SUM(qi.amount) AS amount, COUNT(DISTINCT q.id) AS quotes FROM quotation_items qi JOIN quotations q ON q.id=qi.quotation_id JOIN services s ON s.id=qi.service_id WHERE q.status IN ('sent','accepted','rejected') AND q.created_at BETWEEN ? AND ? GROUP BY s.id ORDER BY amount DESC LIMIT 12", [f, t]);
    const lost = dbx.all("SELECT lost_reason AS reason, COUNT(*) AS n FROM inquiries WHERE status='lost' AND closed_at BETWEEN ? AND ? GROUP BY lost_reason ORDER BY n DESC", [f, t]);
    const topClients = dbx.all("SELECT c.id, c.name_en, c.name_ar, COUNT(*) AS inquiries, SUM(i.status='won') AS won, COALESCE(SUM(CASE WHEN i.status='won' THEN i.est_value END),0) AS won_value FROM inquiries i JOIN clients c ON c.id=i.client_id WHERE i.received_at BETWEEN ? AND ? GROUP BY c.id ORDER BY won_value DESC LIMIT 10", [f, t]);
    const slaRate = dbx.get("SELECT SUM(first_response_at IS NOT NULL AND (julianday(first_response_at)-julianday(received_at))*24 <= sla_hours) AS within, SUM(first_response_at IS NOT NULL) AS responded FROM inquiries WHERE received_at BETWEEN ? AND ?", [f, t]);
    return { from: f, to: to || today(), funnel, by_sales: bySales, by_client_type: byType, by_service: byService, lost_reasons: lost, top_clients: topClients, sla_within_pct: slaRate.responded ? +(100 * slaRate.within / slaRate.responded).toFixed(0) : null };
  },
};

export function auditLog(dbx, ctx, limit = 100) { require(ctx, "manager"); return dbx.all("SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT ?", [limit]); }
