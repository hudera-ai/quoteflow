import { h, ic, chip, statusChip, table, modal, toast, field, inp, sel, confirm } from "../ui.js";
import { t, pick, fmtNum, fmtMoney, fmtDate, fmtDateTime, rel, LANG } from "../i18n.js";
import { render } from "../main.js";
import { priChip, slaChip } from "./dashboard.js";

const STATUSES = ["new", "assigned", "site_visit", "quoting", "quoted", "negotiation", "won", "lost", "cancelled"];
const BOARD = ["new", "assigned", "site_visit", "quoting", "quoted", "negotiation"];
const CHANNELS = ["whatsapp", "email", "phone", "site_visit", "portal", "referral"];
const chLabel = c => c === "site_visit" ? t("site_visit_ch") : t(c);

export async function inquiries(app, route) {
  if (route.id === "new") { inquiryForm(app); return h("div", {}); }
  const view = route.params.view || localStorage.getItem("quoteflow.inqview") || "list";
  const q = { status: route.params.status || "", priority: route.params.priority || "", assigned_to: route.params.assigned_to || "", search: route.params.search || "", limit: 100 };
  const [list, users] = await Promise.all([app.api.inquiries.list(view === "board" ? { status: "open", limit: 300 } : q), app.api.users()]);
  const go = (extra = {}) => { Object.assign(q, extra); location.hash = `#/inquiries?${new URLSearchParams(Object.fromEntries(Object.entries({ ...q, view }).filter(([k, v]) => v && k !== "limit")))}`; };
  const search = inp({ value: q.search, placeholder: t("Search"), style: { width: "220px" }, onkeydown: e => { if (e.key === "Enter") go({ search: e.target.value }); } });
  const filters = h("div", { class: "row", style: { marginBottom: "14px" } },
    h("div", { class: "seg" }, h("button", { class: view === "list" ? "on" : "", onclick: () => { localStorage.setItem("quoteflow.inqview", "list"); location.hash = "#/inquiries?view=list"; } }, t("List")), h("button", { class: view === "board" ? "on" : "", onclick: () => { localStorage.setItem("quoteflow.inqview", "board"); location.hash = "#/inquiries?view=board"; } }, t("Board"))),
    view === "list" ? [search,
      sel([["", t("All statuses")], ["open", t("open")], ...STATUSES.map(s => [s, t(s)])], q.status, { style: { width: "auto" }, onchange: e => go({ status: e.target.value }) }),
      sel([["", t("All priorities")], ...["urgent", "high", "normal", "low"].map(s => [s, t(s)])], q.priority, { style: { width: "auto" }, onchange: e => go({ priority: e.target.value }) }),
      sel([["", t("Everyone")], ...users.filter(u => u.role !== "admin").map(u => [u.id, u.name])], q.assigned_to, { style: { width: "auto" }, onchange: e => go({ assigned_to: e.target.value }) })] : null);
  const body = view === "board" ? board(list.rows) : h("div", { class: "card" }, table([
    { l: t("Inquiry"), v: i => h("div", {}, h("div", { class: "mono small", style: { fontWeight: 600 } }, i.inq_no), h("div", { class: "xs muted" }, fmtDate(i.received_at), " · ", chLabel(i.channel))) },
    { l: t("Client"), v: i => h("div", {}, h("div", {}, pick(i, "client_name")), h("div", { class: "xs muted" }, i.location || "")) },
    { l: t("Subject"), v: i => h("span", { class: "small" }, i.subject) },
    { l: t("Priority"), v: i => priChip(i.priority) }, { l: t("Status"), v: i => statusChip(i.status) },
    { l: t("Response"), v: i => ["won", "lost", "cancelled"].includes(i.status) ? h("span", { class: "xs muted" }, i.response_hours != null ? `${i.response_hours}${t("h")}` : "—") : slaChip(i) },
    { l: t("Assigned to"), v: i => h("span", { class: "small" }, i.assigned_name || h("span", { class: "faint" }, t("Unassigned"))) },
    { l: t("Value"), v: i => h("span", { class: "num small" }, fmtMoney(i.quote_total || i.est_value)), r: true },
  ], list.rows, { onRow: i => location.hash = `#/inquiry/${i.id}` }));
  return h("div", {}, h("div", { class: "topbar" }, h("h1", {}, t("Inquiries")), h("div", { class: "actions" }, h("a", { class: "btn primary", href: "#/inquiries/new" }, ic("plus"), t("New inquiry")))), filters, body,
    view === "list" ? h("p", { class: "xs faint", style: { marginTop: "8px" } }, `${t("Show")} ${list.rows.length} ${t("of")} ${list.total}`) : null);
}

function board(rows) {
  return h("div", { class: "board" }, ...BOARD.map(s => { const items = rows.filter(r => r.status === s); return h("div", { class: "lane" },
    h("div", { class: "lane-hd" }, statusChip(s), h("span", { class: "sp" }), h("span", { class: "xs muted num" }, `${items.length} · ${fmtMoney(items.reduce((a, b) => a + (b.quote_total || b.est_value || 0), 0))}`)),
    ...items.map(i => h("a", { class: "kcard", href: `#/inquiry/${i.id}` }, h("div", { class: "row", style: { justifyContent: "space-between" } }, h("span", { class: "mono xs muted" }, i.inq_no), priChip(i.priority)), h("div", { class: "small", style: { fontWeight: 600, margin: "4px 0" } }, pick(i, "client_name")), h("div", { class: "xs muted" }, i.subject), h("div", { class: "row xs", style: { marginTop: "6px", justifyContent: "space-between" } }, h("span", { class: "num" }, fmtMoney(i.quote_total || i.est_value)), i.sla.overdue ? chip(t("SLA overdue"), "red") : i.assigned_name ? h("span", { class: "muted" }, i.assigned_name.split(" ")[0]) : chip(t("Unassigned"), "amber", false))))); }));
}

export async function inquiryForm(app, i = {}) {
  const [clients, users] = await Promise.all([app.api.clients.list(), app.api.users()]);
  const f = { client_id: sel(clients.map(c => [c.id, pick(c, "name")]), i.client_id || clients[0]?.id), channel: sel(CHANNELS.map(c => [c, chLabel(c)]), i.channel || "whatsapp"), priority: sel(["low", "normal", "high", "urgent"].map(p => [p, t(p)]), i.priority || "normal"),
    subject: inp({ value: i.subject || "" }), location: inp({ value: i.location || "" }), required_by: inp({ type: "date", value: i.required_by || "" }), est_value: inp({ type: "number", value: i.est_value || "" }), assigned_to: sel([["", t("Unassigned")], ...users.filter(u => ["sales", "manager"].includes(u.role)).map(u => [u.id, u.name])], i.assigned_to || ""), details: h("textarea", { value: i.details || "", style: { minHeight: "110px" } }) };
  modal(i.id ? t("Edit") : t("New inquiry"), h("div", { class: "form" }, field(t("Client"), f.client_id, { class: "wide" }), field(t("Subject"), f.subject, { class: "wide" }), field(t("Channel"), f.channel), field(t("Priority"), f.priority), field(t("Location"), f.location), field(t("Required by"), f.required_by), field(t("Est. value"), f.est_value), i.id ? null : field(t("Assigned to"), f.assigned_to), field(t("Details"), f.details, { class: "wide" })),
    [{ label: t("Cancel"), onClick: () => { if (!i.id) history.back(); } }, { label: t("Save"), cls: "primary", onClick: async () => { const p = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])); p.client_id = +p.client_id; p.assigned_to = p.assigned_to ? +p.assigned_to : null; if (i.id) delete p.assigned_to; try { const r = i.id ? await app.api.inquiries.update(i.id, p) : await app.api.inquiries.create(p); toast(t("Saved")); location.hash = `#/inquiry/${r.id}`; render(); } catch (e) { toast(t(e.message), true); return false; } } }]);
}

export async function inquiry(app, route) {
  const i = await app.api.inquiries.get(route.id);
  const users = await app.api.users();
  const isMgr = ["manager", "admin"].includes(app.user.role);
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); render(); } catch (e) { toast(t(e.message), true); } };
  const open = !["won", "lost", "cancelled"].includes(i.status);
  const assignBtn = h("button", { class: "btn sm", onclick: () => { const s = sel(users.filter(u => ["sales", "manager", "estimator"].includes(u.role)).map(u => [u.id, u.name]), i.assigned_to || app.user.id); modal(t("Assign"), field(t("Assigned to"), s), [{ label: t("Cancel") }, { label: t("Assign"), cls: "primary", onClick: () => act(() => app.api.inquiries.assign(i.id, +s.value), t("Saved")) }]); } }, ic("user"), t("Assign"));
  const statusBtn = h("button", { class: "btn sm", onclick: () => { const s = sel(STATUSES.map(x => [x, t(x)]), i.status); const reason = inp({ placeholder: t("Reason") }); const note = inp({ placeholder: t("Note") }); modal(t("Change status"), h("div", { class: "col" }, field(t("Status"), s), field(t("Reason"), reason), field(t("Note"), note)), [{ label: t("Cancel") }, { label: t("Save"), cls: "primary", onClick: () => act(() => app.api.inquiries.setStatus(i.id, { status: s.value, reason: reason.value, note: note.value }), t("Saved")) }]); } }, t("Change status"));
  const noteBtn = h("button", { class: "btn sm", onclick: () => { const ta = h("textarea", { placeholder: t("Note") }); modal(t("Add note"), ta, [{ label: t("Cancel") }, { label: t("Save"), cls: "primary", onClick: () => ta.value.trim() ? act(() => app.api.inquiries.addNote(i.id, ta.value.trim()), t("Saved")) : false }]); } }, t("Add note"));
  const mkFuBtn = () => h("button", { class: "btn sm", onclick: () => { const d = new Date(); d.setDate(d.getDate() + 2); const due = inp({ type: "datetime-local", value: d.toISOString().slice(0, 16) }); const ty = sel(["call", "whatsapp", "email", "visit", "meeting"].map(x => [x, t(x)]), "call"); const note = inp({ placeholder: t("Note") }); modal(t("Schedule follow-up"), h("div", { class: "form" }, field(t("Due"), due), field(t("Type"), ty), field(t("Note"), note, { class: "wide" })), [{ label: t("Cancel") }, { label: t("Save"), cls: "primary", onClick: () => act(() => app.api.followups.create({ inquiry_id: i.id, due_at: due.value.replace("T", " ") + ":00", type: ty.value, note: note.value }), t("Saved")) }]); } }, t("Schedule follow-up"));
  const fuBtn = mkFuBtn();
  const mkQuoteBtn = () => h("button", { class: "btn primary sm", onclick: () => act(async () => { const q = await app.api.quotations.create({ inquiry_id: i.id, auto: true }); location.hash = `#/quotation/${q.id}`; }) }, ic("plus"), t("New quotation"));
  const quoteBtn = mkQuoteBtn();
  const wonBtn = h("button", { class: "btn sm", style: { color: "var(--mint)" }, onclick: () => act(() => app.api.inquiries.setStatus(i.id, { status: "won" }), t("Saved")) }, ic("check"), t("Mark won"));
  const lostBtn = h("button", { class: "btn sm danger", onclick: () => { const r = sel(["Price higher than competitor", "Client postponed the project", "Awarded to incumbent contractor", "Scope changed / no longer required", "No response after follow-ups", "Other"].map(x => [x, x]), ""); modal(t("Mark lost"), field(t("Reason"), r), [{ label: t("Cancel") }, { label: t("Mark lost"), cls: "danger", onClick: () => act(() => app.api.inquiries.setStatus(i.id, { status: "lost", reason: r.value }), t("Saved")) }]); } }, t("Mark lost"));
  const respondBtn = !i.first_response_at ? h("button", { class: "btn sm primary", onclick: () => act(() => app.api.inquiries.respond(i.id), t("Saved")) }, ic("chat"), t("Mark responded")) : null;
  const hasSent = i.quotations.some(q => ["sent"].includes(q.status));
  const actions = h("div", { class: "actions row" }, open ? [respondBtn, assignBtn, quoteBtn, hasSent ? [wonBtn, lostBtn] : null, statusBtn, fuBtn] : statusBtn, noteBtn, h("button", { class: "btn sm ghost", onclick: () => inquiryForm(app, i) }, ic("edit")));
  const TL_ICON = { received: "inbox", assigned: "user", responded: "chat", quoted: "send", quote_draft: "edit", quote_pending: "send", won: "check", lost: "x", cancelled: "x", note: "edit", followup: "check", followup_done: "check", quote_revision: "refresh", quote_returned: "back", negotiation: "refresh" };
  return h("div", {},
    h("div", { class: "crumb" }, h("a", { href: "#/inquiries" }, t("Inquiries")), " / ", i.inq_no),
    h("div", { class: "topbar" }, h("div", {}, h("h1", { class: "row" }, h("span", {}, i.subject), statusChip(i.status), priChip(i.priority)), h("div", { class: "small muted" }, h("span", { class: "mono" }, i.inq_no), " · ", h("a", { href: `#/client/${i.client_id}` }, pick(i, "client_name")), " · ", fmtDateTime(i.received_at), " · ", chLabel(i.channel))), actions),
    h("div", { class: "grid", style: { gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", marginBottom: "14px" } },
      h("div", { class: "col", style: { gap: "14px" } },
        h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Details")), h("span", { class: "sp" }), open ? slaChip(i) : null), h("div", { class: "bd col" },
          h("p", { style: { whiteSpace: "pre-wrap" }, dir: "auto" }, i.details || "—"),
          h("dl", { class: "kv" }, ...[["Location", i.location], ["Required by", fmtDate(i.required_by)], ["Contact", `${i.contact_name || "—"} · ${i.client_phone || ""}`], ["Assigned to", i.assigned_name || t("Unassigned")], ["Response", i.response_hours != null ? `${i.response_hours} ${t("hours")} (${t("Responded")} ${fmtDateTime(i.first_response_at)})` : `${t("Response due")} ${fmtDateTime(i.sla.due)}`], ["Est. value", fmtMoney(i.quote_total || i.est_value)], i.lost_reason ? ["Reason", i.lost_reason] : null].filter(Boolean).flatMap(([k, v]) => [h("dt", {}, t(k)), h("dd", {}, v)])))),
        h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Quotes")), h("span", { class: "sp" }), open ? mkQuoteBtn() : null),
          table([{ l: t("Quote No."), v: q => h("span", { class: "mono small", style: { fontWeight: 600 } }, `${q.quote_no}${q.revision ? " R" + q.revision : ""}`) }, { l: t("Status"), v: q => statusChip(q.status) }, { l: t("Total"), v: q => h("span", { class: "num" }, fmtMoney(q.total, 2)), r: true }, { l: t("Valid until"), v: q => fmtDate(q.valid_until) }, { l: t("Prepared by"), v: q => h("span", { class: "small" }, q.prepared_by_name) }], i.quotations, { onRow: q => location.hash = `#/quotation/${q.id}` })),
        h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Follow-ups")), h("span", { class: "sp" }), open ? mkFuBtn() : null),
          table([{ l: t("Due"), v: f => h("span", { class: "small", style: { color: !f.done_at && new Date(f.due_at.replace(" ", "T")) < Date.now() ? "var(--red)" : "inherit" } }, fmtDateTime(f.due_at)) }, { l: t("Type"), v: f => chip(t(f.type), "grey", false) }, { l: t("Note"), v: f => h("div", {}, h("div", { class: "small" }, f.note || ""), f.outcome ? h("div", { class: "xs muted" }, `${t("Outcome")}: ${f.outcome}`) : null) }, { l: t("By"), v: f => h("span", { class: "small" }, f.user_name) }, { l: "", v: f => f.done_at ? chip(t("Done"), "green") : h("button", { class: "btn sm", onclick: e => { e.stopPropagation(); const o = inp({ placeholder: t("Outcome") }); modal(t("Done"), field(t("Outcome"), o), [{ label: t("Cancel") }, { label: t("Done"), cls: "primary", onClick: () => act(() => app.api.followups.complete(f.id, o.value), t("Saved")) }]); } }, ic("check"), t("Done")) }], i.followups, { empty: t("No follow-ups") }))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Timeline"))), h("div", { class: "bd timeline" }, ...i.activity.map(a => h("div", { class: "tl" }, h("span", { class: "tl-ic" }, ic(TL_ICON[a.type] || "edit")), h("div", {}, h("div", { class: "small" }, a.text), h("div", { class: "xs muted" }, `${fmtDateTime(a.at)} · ${a.user_name || "system"}`))))))));
}
