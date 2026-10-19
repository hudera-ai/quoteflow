import { h, ic, chip, statusChip, table, lineChart, barChart } from "../ui.js";
import { t, pick, fmtNum, fmtMoney, fmtDate, fmtDateTime, rel } from "../i18n.js";

const PRI = { urgent: "red", high: "amber", normal: "blue", low: "grey" };
export const priChip = p => chip(t(p), PRI[p] || "grey");
export const slaChip = i => i.sla.responded ? chip(t("Responded"), "green", false) : i.sla.overdue ? chip(`${t("SLA overdue")} · ${rel(i.sla.due)}`, "red") : chip(`${t("sla_left")} ${rel(i.sla.due)}`, i.sla.at_risk ? "amber" : "grey");
const stat = (label, value, sub, color) => h("div", { class: "card stat" }, h("div", { class: "lbl" }, label), h("div", { class: "val", style: color ? { color: `var(--${color})` } : null }, value), sub ? h("div", { class: "sub" }, sub) : null);

export async function dashboard(app) {
  const d = await app.api.dashboard();
  const attention = [...d.overdue, ...d.recent.filter(i => i.sla.at_risk && !d.overdue.includes(i))].slice(0, 6);
  const months = d.monthly.map(m => m.m);
  return h("div", {},
    h("div", { class: "topbar" }, h("h1", {}, t("Dashboard")), h("div", { class: "actions row" }, h("a", { class: "btn primary", href: "#/inquiries/new" }, ic("plus"), t("New inquiry")))),
    h("div", { class: "grid g4", style: { marginBottom: "14px" } },
      stat(t("Open inquiries"), d.open_count, d.overdue_count ? `${d.overdue_count} ${t("SLA overdue")} · ${d.at_risk_count} ${t("at risk")}` : `${d.at_risk_count} ${t("at risk")}`, d.overdue_count ? "red" : null),
      stat(t("Won this month"), fmtMoney(d.won_month.v), `${d.won_month.n} ${t("deals")} · ${t("Win rate (90d)")} ${d.win_rate ?? "—"}%`, "mint"),
      stat(t("Follow-ups today"), d.followups_today.length, d.followups_overdue.length ? `${d.followups_overdue.length} ${t("overdue")}` : "", d.followups_overdue.length ? "amber" : null),
      stat(t("Awaiting approval"), d.pending_approval, `${t("Avg. first response")} ${d.avg_response_h ?? "—"}${t("h")} · ${t("Avg. time to quote")} ${d.avg_quote_h ?? "—"}${t("h")}`, d.pending_approval ? "primary" : null)),
    h("div", { class: "grid g2", style: { marginBottom: "14px" } },
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Pipeline"))), h("div", { class: "bd" }, barChart(d.pipeline.map(p => ({ l: t(p.status), v: p.count, color: { new: "var(--chart-4)", quoted: "var(--chart-2)", negotiation: "var(--chart-3)" }[p.status] || "var(--chart-1)" }))),
        h("div", { class: "row xs muted", style: { marginTop: "6px", justifyContent: "space-between" } }, ...d.pipeline.map(p => h("span", {}, fmtMoney(p.value)))))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Monthly (received / quoted / won)"))), h("div", { class: "bd" }, lineChart([{ points: d.monthly.map(m => ({ x: m.m + "-01", y: m.received })) }, { points: d.monthly.map(m => ({ x: m.m + "-01", y: m.quoted })) }, { points: d.monthly.map(m => ({ x: m.m + "-01", y: m.won })), area: true }]),
        h("div", { class: "legend" }, h("span", {}, h("i", { style: { background: "var(--chart-1)" } }), t("received")), h("span", {}, h("i", { style: { background: "var(--chart-2)" } }), t("quoted")), h("span", {}, h("i", { style: { background: "var(--chart-3)" } }), t("won")))))),
    h("div", { class: "grid g2", style: { marginBottom: "14px" } },
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Needs attention")), h("span", { class: "sp" }), h("a", { class: "btn sm", href: "#/inquiries?status=open" }, t("Open inquiries"))),
        table([{ l: t("Inquiry"), v: i => h("div", {}, h("div", { class: "mono small", style: { fontWeight: 600 } }, i.inq_no), h("div", { class: "xs muted" }, pick(i, "client_name"))) }, { l: t("Subject"), v: i => h("span", { class: "small" }, i.subject) }, { l: t("Priority"), v: i => priChip(i.priority) }, { l: t("Response due"), v: i => slaChip(i) }], attention, { onRow: i => location.hash = `#/inquiry/${i.id}`, empty: "✓" })),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Follow-ups")), h("span", { class: "sp" }), h("a", { class: "btn sm", href: "#/followups" }, t("View"))),
        table([{ l: t("Due"), v: f => h("span", { class: "small", style: { color: new Date(f.due_at.replace(" ", "T")) < Date.now() ? "var(--red)" : "inherit" } }, fmtDateTime(f.due_at)) }, { l: t("Client"), v: f => h("div", {}, h("div", { class: "small" }, pick(f, "client_name")), h("div", { class: "xs muted mono" }, f.inq_no)) }, { l: t("Type"), v: f => chip(t(f.type), "grey", false) }, { l: t("Note"), v: f => h("span", { class: "small" }, f.note || "") }], [...d.followups_overdue, ...d.followups_today].slice(0, 6), { onRow: f => location.hash = `#/inquiry/${f.inquiry_id}`, empty: t("No follow-ups") }))),
    h("div", { class: "card" }, h("div", { class: "hd" }, h("h2", {}, t("Recent inquiries")), h("span", { class: "sp" }), h("a", { class: "btn sm", href: "#/inquiries" }, t("View"))),
      table([{ l: t("Inquiry"), v: i => h("span", { class: "mono small", style: { fontWeight: 600 } }, i.inq_no) }, { l: t("Client"), v: i => pick(i, "client_name") }, { l: t("Subject"), v: i => h("span", { class: "small" }, i.subject) }, { l: t("Status"), v: i => statusChip(i.status) }, { l: t("Assigned to"), v: i => h("span", { class: "small" }, i.assigned_name || h("span", { class: "faint" }, t("Unassigned"))) }, { l: t("Value"), v: i => h("span", { class: "num small" }, fmtMoney(i.quote_total || i.est_value)), r: true }, { l: t("Received"), v: i => h("span", { class: "small muted" }, fmtDate(i.received_at)) }], d.recent, { onRow: i => location.hash = `#/inquiry/${i.id}` })));
}
