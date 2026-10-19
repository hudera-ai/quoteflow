import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import initSqlJs from "sql.js";
import { wrap } from "../shared/dbx.js";
import { applySeed, SERVICES } from "../shared/seed.js";
import { draftItems, computeTotals, slaState } from "../shared/estimator.js";
import { auth, inquiries, quotations, followups, dashboard, clients, ApiError } from "../shared/service.js";

const svcs = SERVICES.map((s, i) => ({ id: i + 1, code: s[0], name_ar: s[1], name_en: s[2], unit: s[4], base_rate: s[5] }));

test("estimator: extracts services with quantities from Arabic and English text", () => {
  const a = draftItems("نحتاج كور 30 نقطة قطر 150 وقص جدار 18 م.ط في الدور الأرضي", svcs);
  assert.deepEqual(a.map(i => [i.code, i.qty]), [["CORE-150", 30], ["CUT-WALL", 18], ["MOBIL", 1]]);
  const b = draftItems("We need coring of 40 holes Ø150 mm and 25 holes Ø100 mm in the basement slab.", svcs);
  assert.deepEqual(b.map(i => [i.code, i.qty]), [["CORE-150", 40], ["CORE-100", 25], ["MOBIL", 1]]);
  const c = draftItems("Roof waterproofing. Roof area approx 850 m2 with existing membrane damaged.", svcs);
  assert.deepEqual(c.map(i => [i.code, i.qty, i.unit]), [["WP-ROOF", 850, "m2"]]);
  const d = draftItems("طلب عرض سعر لعقد صيانة تكييف سنوي", svcs);
  assert.deepEqual(d.map(i => [i.code, i.qty]), [["HVAC-MAINT", 12]]);
  assert.deepEqual(draftItems("hello", svcs), []);
});

test("totals: discount before VAT, 2-dp rounding", () => {
  const t = computeTotals([{ qty: 3, rate: 100.555 }, { qty: 1, rate: 50 }], { discount_pct: 10, vat_rate: 15 });
  assert.equal(t.lines[0].amount, 301.67); assert.equal(t.subtotal, 351.67); assert.equal(t.discount, 35.17); assert.equal(t.vat, 47.48); assert.equal(t.total, 363.98);
});

test("SLA state", () => {
  const past = new Date(Date.now() - 50 * 36e5).toISOString().slice(0, 19).replace("T", " ");
  const s = slaState({ received_at: past, sla_hours: 48, first_response_at: null });
  assert.equal(s.overdue, true); assert.equal(s.responded, false);
  const ok = slaState({ received_at: past, sla_hours: 72, first_response_at: past });
  assert.equal(ok.responded, true); assert.equal(ok.overdue, false);
});

let dbx, mgr, sales, est;
before(async () => {
  const SQL = await initSqlJs();
  dbx = wrap(new SQL.Database());
  dbx.exec(fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  applySeed(dbx, { today: new Date("2026-10-19"), days: 60 });
  mgr = { user: (await auth.login(dbx, { email: "tariq@marasim.example", password: "demo1234" })).user };
  sales = { user: (await auth.login(dbx, { email: "lina@marasim.example", password: "demo1234" })).user };
  est = { user: (await auth.login(dbx, { email: "hani@marasim.example", password: "demo1234" })).user };
});

test("login rejects wrong password", async () => {
  await assert.rejects(() => auth.login(dbx, { email: "lina@marasim.example", password: "x" }), e => e instanceof ApiError && e.status === 401);
});

test("inquiry → auto-drafted quotation → approval → won, with numbering and status transitions", () => {
  const c = clients.list(dbx, sales)[0];
  const i = inquiries.create(dbx, sales, { client_id: c.id, subject: "Coring test", details: "coring 20 holes Ø100 mm and wall cutting 12 m", channel: "whatsapp", priority: "high" });
  assert.match(i.inq_no, /^INQ-\d{4}-\d{4}$/); assert.equal(i.status, "new"); assert.equal(i.sla_hours, 24);
  inquiries.assign(dbx, sales, i.id, { user_id: sales.user.id });
  const q = quotations.create(dbx, est, { inquiry_id: i.id, auto: true });
  assert.match(q.quote_no, /^QT-\d{4}-\d{4}$/); assert.equal(q.status, "draft");
  assert.deepEqual(q.items.map(x => [x.service_code, x.qty]), [["CORE-100", 20], ["CUT-WALL", 12], ["MOBIL", 1]]);
  assert.equal(q.total, +(q.subtotal * 1.15).toFixed(2));
  assert.equal(inquiries.get(dbx, sales, i.id).status, "quoting");
  // estimator cannot approve; manager can
  quotations.submit(dbx, est, q.id);
  assert.throws(() => quotations.approve(dbx, est, q.id), e => e.status === 403);
  assert.throws(() => quotations.update(dbx, est, q.id, { discount_pct: 5 }), e => e.code === "locked");
  const sent = quotations.approve(dbx, mgr, q.id);
  assert.equal(sent.status, "sent"); assert.equal(sent.approved_by, mgr.user.id);
  const i2 = inquiries.get(dbx, sales, i.id); assert.equal(i2.status, "quoted"); assert.ok(i2.quoted_at);
  // closing requires a reason for lost
  assert.throws(() => inquiries.setStatus(dbx, sales, i.id, { status: "lost" }), e => e.code === "validation");
  const won = inquiries.setStatus(dbx, sales, i.id, { status: "won" });
  assert.equal(won.status, "won"); assert.equal(quotations.get(dbx, sales, q.id).status, "accepted");
});

test("revision supersedes the sent quotation", () => {
  const c = clients.list(dbx, sales)[1];
  const i = inquiries.create(dbx, sales, { client_id: c.id, subject: "Roof waterproofing 500 m2", details: "roof waterproofing 500 m2" });
  const q = quotations.create(dbx, sales, { inquiry_id: i.id });
  quotations.approve(dbx, mgr, q.id);
  const r = quotations.revise(dbx, sales, q.id);
  assert.equal(r.revision, 1); assert.equal(r.status, "draft"); assert.equal(r.quote_no, q.quote_no);
  assert.equal(quotations.get(dbx, sales, q.id).status, "superseded");
  assert.equal(inquiries.get(dbx, sales, i.id).status, "negotiation");
  quotations.update(dbx, sales, r.id, { discount_pct: 5 });
  assert.equal(quotations.get(dbx, sales, r.id).discount, +(quotations.get(dbx, sales, r.id).subtotal * 0.05).toFixed(2));
});

test("cannot close as won/lost without a sent quotation", () => {
  const c = clients.list(dbx, sales)[2];
  const i = inquiries.create(dbx, sales, { client_id: c.id, subject: "x" });
  assert.throws(() => inquiries.setStatus(dbx, sales, i.id, { status: "won" }), e => e.code === "no_quote");
});

test("follow-ups: create, list by scope, complete stops the SLA clock", () => {
  const c = clients.list(dbx, sales)[3];
  const i = inquiries.create(dbx, sales, { client_id: c.id, subject: "Follow-up test" });
  const past = new Date(Date.now() - 2 * 36e5).toISOString().slice(0, 19).replace("T", " ");
  const f = followups.create(dbx, sales, { inquiry_id: i.id, due_at: past, type: "call", note: "call back" });
  assert.ok(followups.list(dbx, sales, { scope: "overdue" }).some(x => x.id === f.id));
  followups.complete(dbx, sales, f.id, { outcome: "spoke to client" });
  assert.ok(inquiries.get(dbx, sales, i.id).first_response_at);
  assert.ok(!followups.list(dbx, sales, { scope: "open" }).some(x => x.id === f.id));
});

test("dashboard and reports compute", () => {
  const d = dashboard.summary(dbx, mgr);
  assert.ok(d.open_count > 0); assert.equal(d.pipeline.length, 6); assert.ok(d.monthly.length >= 2);
  const r = dashboard.reports(dbx, mgr, {});
  assert.ok(r.funnel.received >= r.funnel.quoted); assert.ok(r.by_sales.length >= 1);
});
