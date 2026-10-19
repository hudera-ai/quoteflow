import { h, ic, chip, statusChip, modal, toast, field, inp, sel, confirm } from "../ui.js";
import { t, pick, fmtNum, fmtMoney, fmtDate, fmtDateTime, unit, LANG } from "../i18n.js";
import { render } from "../main.js";
import { computeTotals } from "../../shared/estimator.js";

export async function quotation(app, route) {
  const q = await app.api.quotations.get(route.id);
  const services = await app.api.services.list();
  const isMgr = ["manager", "admin"].includes(app.user.role);
  let edit = q.can_edit && route.sub !== "view";
  const state = { items: q.items.map(x => ({ ...x })), discount_pct: q.discount_pct, scope_notes: q.scope_notes || "", terms: q.terms || "", internal_notes: q.internal_notes || "", valid_until: q.valid_until || "" };
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); render(); } catch (e) { toast(t(e.message), true); } };
  const payload = () => ({ items: state.items.map(x => ({ service_id: x.service_id || null, description: x.description, unit: x.unit, qty: +x.qty || 0, rate: +x.rate || 0 })), discount_pct: +state.discount_pct || 0, scope_notes: state.scope_notes, terms: state.terms, internal_notes: state.internal_notes, valid_until: state.valid_until });
  const save = () => act(() => app.api.quotations.update(q.id, payload()), t("Saved"));
  const c = app.company || {};
  const comp = (en, ar) => LANG === "ar" ? (ar || en) : (en || ar);

  const bind = (row, k, el) => { el.addEventListener("input", () => { row[k] = el.value; drawTotals(); }); return el; };
  const unitOpts = ["m", "m2", "m3", "nos", "ls", "visit", "month", "ton", "kg", "day", "hr"].map(u => [u, unit(u)]);
  const body = h("div", { class: "col", style: { gap: "14px" } });
  const totalsBox = h("div", {});
  function drawTotals() {
    const tot = computeTotals(state.items, { discount_pct: state.discount_pct, vat_rate: q.vat_rate });
    totalsBox.replaceChildren(h("div", { class: "totals" },
      h("div", {}, h("span", {}, t("Subtotal")), h("b", { class: "num" }, fmtMoney(tot.subtotal, 2))),
      h("div", {}, h("span", {}, t("Discount"), " ", edit ? bind(state, "discount_pct", inp({ type: "number", value: state.discount_pct, min: 0, max: 100, step: "0.5", style: { width: "70px", height: "30px", display: "inline-block", margin: "0 6px" } })) : `${state.discount_pct}`, "%"), h("b", { class: "num" }, `- ${fmtMoney(tot.discount, 2)}`)),
      h("div", {}, h("span", {}, `${t("VAT")} ${q.vat_rate}%`), h("b", { class: "num" }, fmtMoney(tot.vat, 2))),
      h("div", { class: "grand" }, h("span", {}, t("Total")), h("b", { class: "num" }, fmtMoney(tot.total, 2)))));
    body.querySelectorAll("[data-amt]").forEach((td, i) => { if (tot.lines[i]) td.textContent = fmtNum(tot.lines[i].amount, 2); });
  }
  function draw() {
    const rows = state.items.map((row, idx) => h("tr", {},
      h("td", { class: "muted xs" }, idx + 1),
      h("td", {}, edit ? h("div", { class: "col", style: { gap: "4px" } }, bind(row, "description", inp({ value: row.description })), row.service_code ? h("span", { class: "xs faint mono" }, row.service_code) : null) : h("div", {}, h("div", {}, row.description), row.service_code ? h("div", { class: "xs faint mono" }, row.service_code) : null)),
      h("td", {}, edit ? bind(row, "unit", sel(unitOpts, row.unit)) : unit(row.unit)),
      h("td", { class: "r num" }, edit ? bind(row, "qty", inp({ type: "number", value: row.qty, step: "any", style: { width: "90px" } })) : fmtNum(row.qty, 2)),
      h("td", { class: "r num" }, edit ? bind(row, "rate", inp({ type: "number", value: row.rate, step: "any", style: { width: "110px" } })) : fmtNum(row.rate, 2)),
      h("td", { class: "r num", "data-amt": 1 }, fmtNum((+row.qty || 0) * (+row.rate || 0), 2)),
      edit ? h("td", {}, h("button", { class: "btn ghost sm", onclick: () => { state.items.splice(idx, 1); draw(); } }, ic("x"))) : null));
    const addFromCat = () => { const s = sel(services.map(x => [x.id, `${x.code} · ${pick(x, "name")} (${fmtNum(x.base_rate)}/${unit(x.unit)})`]), services[0]?.id); modal(t("From catalogue"), field(t("Items"), s), [{ label: t("Cancel") }, { label: t("Add line"), cls: "primary", onClick: () => { const x = services.find(v => v.id === +s.value); state.items.push({ service_id: x.id, service_code: x.code, description: pick(x, "name"), unit: x.unit, qty: 1, rate: x.base_rate }); draw(); } }]); };
    body.replaceChildren(
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Items")), h("span", { class: "sp" }), edit ? [h("button", { class: "btn sm", onclick: addFromCat }, ic("plus"), t("From catalogue")), h("button", { class: "btn sm", onclick: () => { state.items.push({ description: "", unit: "ls", qty: 1, rate: 0 }); draw(); } }, ic("plus"), t("Add line"))] : chip(state.items.length, "grey", false)),
        h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, t("Description")), h("th", {}, t("Unit")), h("th", { class: "r" }, t("Qty")), h("th", { class: "r" }, t("Rate")), h("th", { class: "r" }, t("Amount")), edit ? h("th", {}) : null)), h("tbody", {}, rows.length ? rows : h("tr", {}, h("td", { colSpan: 7, class: "empty small" }, t("Nothing here yet")))))),
        h("div", { class: "bd" }, totalsBox)),
      h("div", { class: "grid g2" },
        h("div", { class: "card" }, h("div", { class: "bd col" }, field(t("Scope notes"), edit ? bind(state, "scope_notes", h("textarea", { value: state.scope_notes })) : h("p", { class: "small", style: { whiteSpace: "pre-wrap" } }, state.scope_notes || "—")), field(t("Terms"), edit ? bind(state, "terms", h("textarea", { value: state.terms, style: { minHeight: "110px" } })) : h("p", { class: "small", style: { whiteSpace: "pre-wrap" } }, state.terms || "—")))),
        h("div", { class: "card no-print" }, h("div", { class: "bd col" }, field(t("Valid until"), edit ? bind(state, "valid_until", inp({ type: "date", value: state.valid_until })) : inp({ value: fmtDate(state.valid_until), disabled: true })), field(t("Internal notes"), edit ? bind(state, "internal_notes", h("textarea", { value: state.internal_notes })) : h("p", { class: "small muted", style: { whiteSpace: "pre-wrap" } }, state.internal_notes || "—")),
          h("dl", { class: "kv" }, h("dt", {}, t("Prepared by")), h("dd", {}, q.prepared_by_name || "—"), h("dt", {}, t("Approved by")), h("dd", {}, q.approved_by_name ? `${q.approved_by_name} · ${fmtDateTime(q.approved_at)}` : "—"), h("dt", {}, t("Sent")), h("dd", {}, fmtDateTime(q.sent_at)))))));
    drawTotals();
  }
  draw();

  const actions = h("div", { class: "actions row" },
    h("button", { class: "btn", onclick: () => { const was = edit; edit = false; draw(); setTimeout(() => { window.print(); edit = was; draw(); }, 80); } }, ic("print"), t("Print / PDF")),
    edit ? h("button", { class: "btn", onclick: save }, t("Save")) : null,
    edit && q.status === "draft" && !isMgr ? h("button", { class: "btn primary", onclick: () => act(async () => { await app.api.quotations.update(q.id, payload()); await app.api.quotations.submit(q.id); }, t("Sent")) }, ic("send"), t("Submit for approval")) : null,
    isMgr && ["draft", "pending_approval"].includes(q.status) ? h("button", { class: "btn primary", onclick: () => act(async () => { if (edit) await app.api.quotations.update(q.id, payload()); await app.api.quotations.approve(q.id); }, t("Approved")) }, ic("check"), t("Approve & send")) : null,
    isMgr && q.status === "pending_approval" ? h("button", { class: "btn", onclick: () => { const ta = h("textarea", { placeholder: t("Please revise") }); modal(t("Return to draft"), ta, [{ label: t("Cancel") }, { label: t("Return to draft"), cls: "danger", onClick: () => act(() => app.api.quotations.reject(q.id, ta.value), t("Saved")) }]); } }, t("Return to draft")) : null,
    ["sent", "rejected", "expired"].includes(q.status) ? h("button", { class: "btn", onclick: () => act(async () => { const r = await app.api.quotations.revise(q.id); location.hash = `#/quotation/${r.id}`; }) }, ic("refresh"), t("New revision")) : null,
    q.status === "sent" ? [h("button", { class: "btn", style: { color: "var(--mint)" }, onclick: () => act(() => app.api.inquiries.setStatus(q.inquiry_id, { status: "won" }), t("Saved")) }, ic("check"), t("Mark won"))] : null,
    edit && q.status === "draft" ? h("button", { class: "btn ghost", onclick: async () => { if (await confirm(t("Delete"), t("Delete this draft?"))) { await app.api.quotations.remove(q.id); location.hash = `#/inquiry/${q.inquiry_id}`; } } }, ic("trash")) : null);

  const printHead = h("div", { class: "print-only" },
    h("div", { class: "print-head" }, h("div", {}, h("div", { style: { fontWeight: 800, fontSize: "17px" } }, comp(c.name_en, c.name_ar)), h("div", { class: "small" }, comp(c.name_ar, c.name_en)), h("div", { class: "xs" }, c.address), h("div", { class: "xs" }, `${t("CR No.")} ${c.cr_no || "—"} · ${t("VAT No.")} ${c.vat_no || "—"} · ${c.phone || ""} · ${c.email || ""}`)),
      h("div", { style: { textAlign: "end" } }, h("div", { style: { fontWeight: 800, fontSize: "20px", letterSpacing: ".04em" } }, t("QUOTATION")), h("div", { class: "mono small" }, `${q.quote_no}${q.revision ? " R" + q.revision : ""}`), h("div", { class: "small" }, `${t("Date")}: ${fmtDate(q.issued_at || q.created_at)}`), h("div", { class: "small" }, `${t("Valid until")}: ${fmtDate(state.valid_until)}`))),
    h("div", { class: "print-meta" }, h("div", {}, h("b", {}, t("To")), h("div", {}, pick(q, "client_name")), h("div", { class: "small" }, `${t("Attn")}: ${q.contact_name || "—"}`), h("div", { class: "xs muted" }, [q.client_city, q.client_phone, q.client_email].filter(Boolean).join(" · ")), q.client_vat ? h("div", { class: "xs muted" }, `${t("VAT No.")} ${q.client_vat}`) : null),
      h("div", {}, h("b", {}, t("Project / location")), h("div", {}, q.subject), h("div", { class: "small" }, q.location || ""), h("div", { class: "xs muted" }, `${t("Ref. inquiry")}: ${q.inq_no}`))));
  const printFoot = h("div", { class: "print-only" },
    c.bank_name ? h("div", { class: "xs muted", style: { marginTop: "10px" } }, `${t("Bank")}: ${c.bank_name} · ${t("IBAN")}: ${c.iban}`) : null,
    h("div", { class: "sig-grid" }, ...[[t("Authorized signature"), q.approved_by_name || q.prepared_by_name || ""], [t("Client acceptance"), ""]].map(([k, v]) => h("div", { style: { borderTop: "1px solid #999", paddingTop: "6px" } }, h("div", { style: { fontWeight: 700 } }, k), h("div", {}, v || " "), h("div", { class: "faint xs" }, `${t("Date")}: ________`)))));

  return h("div", {},
    h("div", { class: "crumb no-print" }, h("a", { href: "#/inquiries" }, t("Inquiries")), " / ", h("a", { href: `#/inquiry/${q.inquiry_id}` }, q.inq_no), " / ", q.quote_no),
    h("div", { class: "topbar" }, h("div", {}, h("h1", { class: "row" }, h("span", { class: "mono" }, `${q.quote_no}${q.revision ? " R" + q.revision : ""}`), statusChip(q.status)), h("div", { class: "small muted no-print" }, h("a", { href: `#/client/${q.client_id}` }, pick(q, "client_name")), " · ", q.subject)), actions),
    !edit && q.status !== "draft" && isMgr === false && !["sent", "accepted", "rejected", "superseded", "expired"].includes(q.status) ? h("div", { class: "banner blue no-print", style: { marginBottom: "14px" } }, t("Quotation is locked")) : null,
    q.internal_notes && q.internal_notes.startsWith("[Manager]") ? h("div", { class: "banner no-print", style: { marginBottom: "14px" } }, ic("warn"), q.internal_notes.split("\n")[0]) : null,
    printHead, body, printFoot);
}
