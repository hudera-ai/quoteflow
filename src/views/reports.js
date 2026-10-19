import { h, chip, table, barChart, inp } from "../ui.js";
import { t, pick, fmtNum, fmtMoney, unit } from "../i18n.js";

export async function reports(app, route) {
  const r = await app.api.reports({ from: route.params.from || "", to: route.params.to || "" });
  const go = () => location.hash = `#/reports?from=${from.value}&to=${to.value}`;
  const from = inp({ type: "date", value: r.from, style: { width: "auto" }, onchange: go }), to = inp({ type: "date", value: r.to, style: { width: "auto" }, onchange: go });
  const f = r.funnel;
  const funnel = [["received", f.received, "var(--chart-4)"], ["responded", f.responded, "var(--chart-1)"], ["quoted", f.quoted, "var(--chart-1)"], ["won", f.won, "var(--chart-2)"], ["lost", f.lost, "var(--red)"]];
  const pct = (a, b) => b ? `${Math.round(100 * a / b)}%` : "—";
  return h("div", {},
    h("div", { class: "topbar" }, h("h1", {}, t("Reports")), h("div", { class: "actions row" }, h("span", { class: "small muted" }, t("Period")), from, h("span", { class: "muted" }, "→"), to)),
    h("div", { class: "grid g4", style: { marginBottom: "14px" } },
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("received")), h("div", { class: "val" }, f.received), h("div", { class: "sub" }, `${t("responded")} ${pct(f.responded, f.received)}`)),
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("quoted")), h("div", { class: "val" }, f.quoted), h("div", { class: "sub" }, pct(f.quoted, f.received))),
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("Win rate (90d)").split(" (")[0]), h("div", { class: "val", style: { color: "var(--mint)" } }, pct(f.won, f.won + f.lost)), h("div", { class: "sub" }, `${f.won} ${t("won")} · ${f.lost} ${t("lost")} · ${f.cancelled} ${t("cancelled")}`)),
      h("div", { class: "card stat" }, h("div", { class: "lbl" }, t("SLA met")), h("div", { class: "val" }, r.sla_within_pct != null ? `${r.sla_within_pct}%` : "—"))),
    h("div", { class: "grid g2", style: { marginBottom: "14px" } },
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Funnel"))), h("div", { class: "bd" }, barChart(funnel.map(([l, v, color]) => ({ l: t(l), v, color }))))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Lost reasons"))), table([{ l: t("Reason"), v: x => x.reason || "—" }, { l: t("count"), v: x => fmtNum(x.n), r: true, num: true }], r.lost_reasons))),
    h("div", { class: "grid g2", style: { marginBottom: "14px" } },
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("By sales rep"))), table([{ l: t("sales"), v: x => x.name }, { l: t("Inquiries"), v: x => fmtNum(x.inquiries), r: true, num: true }, { l: t("won"), v: x => fmtNum(x.won), r: true, num: true }, { l: t("lost"), v: x => fmtNum(x.lost), r: true, num: true }, { l: t("Won value"), v: x => h("span", { class: "num" }, fmtMoney(x.won_value)), r: true }, { l: t("Avg. first response"), v: x => `${x.resp_h ? x.resp_h.toFixed(1) : "—"}${t("h")}`, r: true }], r.by_sales)),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("By client type"))), table([{ l: t("Type"), v: x => chip(t(x.type), "blue", false) }, { l: t("Inquiries"), v: x => fmtNum(x.inquiries), r: true, num: true }, { l: t("won"), v: x => fmtNum(x.won), r: true, num: true }, { l: t("Won value"), v: x => h("span", { class: "num" }, fmtMoney(x.won_value)), r: true }], r.by_client_type))),
    h("div", { class: "grid g2" },
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Top services quoted"))), table([{ l: t("Code"), v: x => h("span", { class: "mono small" }, x.code) }, { l: t("Description"), v: x => h("span", { class: "small" }, pick(x, "name")) }, { l: t("Quotes"), v: x => fmtNum(x.quotes), r: true, num: true }, { l: t("Qty"), v: x => fmtNum(x.qty), r: true, num: true }, { l: t("Amount"), v: x => h("span", { class: "num" }, fmtMoney(x.amount)), r: true }], r.by_service)),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Top clients"))), table([{ l: t("Client"), v: x => pick(x, "name") }, { l: t("Inquiries"), v: x => fmtNum(x.inquiries), r: true, num: true }, { l: t("won"), v: x => fmtNum(x.won), r: true, num: true }, { l: t("Won value"), v: x => h("span", { class: "num" }, fmtMoney(x.won_value)), r: true }], r.top_clients, { onRow: x => location.hash = `#/client/${x.id}` }))));
}
