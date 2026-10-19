import { h, ic, chip, statusChip, table, modal, toast, field, inp, sel } from "../ui.js";
import { t, pick, fmtNum, fmtMoney, fmtDate } from "../i18n.js";
import { render } from "../main.js";
import { priChip } from "./dashboard.js";

const TYPES = ["contractor", "developer", "government", "facility", "individual"];

export async function clients(app, route) {
  const list = await app.api.clients.list({ search: route.params.search || "" });
  const search = inp({ value: route.params.search || "", placeholder: t("Search"), style: { width: "240px" }, onkeydown: e => { if (e.key === "Enter") location.hash = `#/clients?search=${encodeURIComponent(e.target.value)}`; } });
  return h("div", {},
    h("div", { class: "topbar" }, h("h1", {}, t("Clients")), h("div", { class: "actions row" }, search, h("button", { class: "btn primary", onclick: () => clientForm(app) }, ic("plus"), t("New client")))),
    h("div", { class: "card" }, table([
      { l: t("Client"), v: c => h("div", {}, h("div", { style: { fontWeight: 600 } }, pick(c, "name")), h("div", { class: "xs muted" }, pick(c, "name") === c.name_en ? c.name_ar : c.name_en)) },
      { l: t("Type"), v: c => chip(t(c.type), "blue", false) }, { l: t("City"), v: c => c.city || "—" },
      { l: t("Contact"), v: c => h("div", {}, h("div", { class: "small" }, c.contact_name || "—"), h("div", { class: "xs muted" }, c.phone || "")) },
      { l: t("Inquiries"), v: c => fmtNum(c.inquiries), r: true, num: true }, { l: t("Won"), v: c => fmtNum(c.won), r: true, num: true }, { l: t("Won value"), v: c => h("span", { class: "num" }, fmtMoney(c.won_value)), r: true },
      { l: t("Last inquiry"), v: c => h("span", { class: "small muted" }, fmtDate(c.last_inquiry)) },
    ], list, { onRow: c => location.hash = `#/client/${c.id}` })));
}

export async function client(app, route) {
  const c = await app.api.clients.get(route.id);
  const won = c.inquiries.filter(i => i.status === "won");
  return h("div", {},
    h("div", { class: "crumb" }, h("a", { href: "#/clients" }, t("Clients")), " / ", pick(c, "name")),
    h("div", { class: "topbar" }, h("div", {}, h("h1", {}, pick(c, "name")), h("div", { class: "small muted" }, chip(t(c.type), "blue", false), " ", c.city || "")), h("div", { class: "actions row" }, h("button", { class: "btn", onclick: () => clientForm(app, c) }, ic("edit"), t("Edit")), h("a", { class: "btn primary", href: "#/inquiries/new" }, ic("plus"), t("New inquiry")))),
    h("div", { class: "grid g4", style: { marginBottom: "14px" } },
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("Inquiries")), h("div", { class: "val" }, c.inquiries.length)),
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("Won")), h("div", { class: "val" }, won.length), h("div", { class: "sub" }, c.inquiries.length ? `${Math.round(100 * won.length / Math.max(1, c.inquiries.filter(i => ["won", "lost"].includes(i.status)).length))}%` : "")),
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("Won value")), h("div", { class: "val", style: { fontSize: "22px" } }, fmtMoney(won.reduce((a, b) => a + (b.quote_total || b.est_value || 0), 0)))),
      h("div", { class: "card" }, h("div", { class: "bd" }, h("dl", { class: "kv" }, ...[["Contact", c.contact_name], ["Phone", c.phone], ["Email", c.email], ["VAT No.", c.vat_no]].flatMap(([k, v]) => [h("dt", {}, t(k)), h("dd", {}, v || "—")]))))),
    h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Inquiries"))), table([
      { l: t("Inquiry"), v: i => h("span", { class: "mono small", style: { fontWeight: 600 } }, i.inq_no) }, { l: t("Subject"), v: i => h("span", { class: "small" }, i.subject) }, { l: t("Priority"), v: i => priChip(i.priority) }, { l: t("Status"), v: i => statusChip(i.status) }, { l: t("Value"), v: i => h("span", { class: "num small" }, fmtMoney(i.quote_total || i.est_value)), r: true }, { l: t("Received"), v: i => h("span", { class: "small muted" }, fmtDate(i.received_at)) },
    ], c.inquiries, { onRow: i => location.hash = `#/inquiry/${i.id}` })),
    c.notes ? h("div", { class: "card", style: { marginTop: "14px" } }, h("div", { class: "bd" }, h("b", {}, t("Notes")), h("p", { class: "small" }, c.notes))) : null);
}

function clientForm(app, c = {}) {
  const f = { name_en: inp({ value: c.name_en || "" }), name_ar: inp({ value: c.name_ar || "", dir: "rtl" }), type: sel(TYPES.map(x => [x, t(x)]), c.type || "contractor"), city: inp({ value: c.city || "" }), contact_name: inp({ value: c.contact_name || "" }), phone: inp({ value: c.phone || "" }), email: inp({ value: c.email || "" }), vat_no: inp({ value: c.vat_no || "" }), notes: h("textarea", { value: c.notes || "" }) };
  modal(c.id ? t("Edit") : t("New client"), h("div", { class: "form" }, field(t("Name (EN)"), f.name_en), field(t("Name (AR)"), f.name_ar), field(t("Type"), f.type), field(t("City"), f.city), field(t("Contact"), f.contact_name), field(t("Phone"), f.phone), field(t("Email"), f.email), field(t("VAT No."), f.vat_no), field(t("Notes"), f.notes, { class: "wide" })),
    [{ label: t("Cancel") }, { label: t("Save"), cls: "primary", onClick: async () => { const p = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])); try { const r = c.id ? await app.api.clients.update(c.id, p) : await app.api.clients.create(p); toast(t("Saved")); location.hash = `#/client/${r.id}`; render(); } catch (e) { toast(t(e.message), true); return false; } } }]);
}
