import { h, ic, chip, statusChip, table, modal, toast, field, inp } from "../ui.js";
import { t, pick, fmtDateTime } from "../i18n.js";
import { render } from "../main.js";

export async function followups(app, route) {
  const scope = route.params.scope || "open";
  const mine = route.params.mine === "1";
  const rows = await app.api.followups.list({ scope, user_id: mine ? app.user.id : "" });
  const act = async (fn, msg) => { try { await fn(); toast(msg); render(); } catch (e) { toast(t(e.message), true); } };
  const seg = h("div", { class: "seg" }, ...[["open", t("Upcoming")], ["today", t("Today")], ["overdue", t("Overdue")], ["done", t("Completed")]].map(([v, l]) => h("button", { class: scope === v ? "on" : "", onclick: () => location.hash = `#/followups?scope=${v}${mine ? "&mine=1" : ""}` }, l)));
  const mineBtn = h("button", { class: `btn sm ${mine ? "primary" : ""}`, onclick: () => location.hash = `#/followups?scope=${scope}${mine ? "" : "&mine=1"}` }, t("Mine"));
  return h("div", {},
    h("div", { class: "topbar" }, h("h1", {}, t("Follow-ups")), h("div", { class: "actions row" }, seg, mineBtn)),
    h("div", { class: "card" }, table([
      { l: t("Due"), v: f => h("span", { class: "small", style: { color: !f.done_at && new Date(f.due_at.replace(" ", "T")) < Date.now() ? "var(--red)" : "inherit", fontWeight: 600 } }, fmtDateTime(f.due_at)) },
      { l: t("Client"), v: f => h("div", {}, h("div", {}, pick(f, "client_name")), h("div", { class: "xs muted" }, f.client_phone || "")) },
      { l: t("Inquiry"), v: f => h("div", {}, h("span", { class: "mono small" }, f.inq_no), " ", statusChip(f.inquiry_status), h("div", { class: "xs muted" }, f.subject)) },
      { l: t("Type"), v: f => chip(t(f.type), "grey", false) }, { l: t("Note"), v: f => h("div", {}, h("div", { class: "small" }, f.note || ""), f.outcome ? h("div", { class: "xs muted" }, `${t("Outcome")}: ${f.outcome}`) : null) }, { l: t("By"), v: f => h("span", { class: "small" }, f.user_name) },
      { l: "", v: f => f.done_at ? chip(t("Done"), "green") : h("div", { class: "row", style: { gap: "4px" } }, f.type === "whatsapp" && f.client_phone ? h("a", { class: "btn sm", target: "_blank", rel: "noopener", href: `https://wa.me/${f.client_phone.replace(/\D/g, "")}`, onclick: e => e.stopPropagation() }, ic("chat")) : null, h("button", { class: "btn sm", onclick: e => { e.stopPropagation(); const o = inp({ placeholder: t("Outcome") }); modal(t("Done"), field(t("Outcome"), o), [{ label: t("Cancel") }, { label: t("Done"), cls: "primary", onClick: () => act(() => app.api.followups.complete(f.id, o.value), t("Saved")) }]); } }, ic("check"), t("Done"))) },
    ], rows, { onRow: f => location.hash = `#/inquiry/${f.inquiry_id}`, empty: t("No follow-ups") })));
}
