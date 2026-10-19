import { h, ic, toast } from "../ui.js";
import { t, LANG, setLang } from "../i18n.js";
import { render } from "../main.js";

const DEMO = [["tariq@marasim.example", "Tariq Al-Mutairi", "manager"], ["lina@marasim.example", "Lina Haddad", "sales"], ["hani@marasim.example", "Eng. Hani Mostafa", "estimator"], ["nour@marasim.example", "Nour Al-Dossari", "admin"]];

export function login(app) {
  const email = h("input", { type: "email", placeholder: "name@company.com", autocomplete: "username", value: "tariq@marasim.example" });
  const pass = h("input", { type: "password", placeholder: "••••••••", autocomplete: "current-password", value: "demo1234" });
  async function go(e, p) {
    try { app.user = await app.api.login(e, p); app.company = await app.api.company(); render(); }
    catch (err) { toast(t(err.message) || t("Wrong email or password"), true); }
  }
  const form = h("form", { class: "col", onsubmit: e => { e.preventDefault(); go(email.value, pass.value); } },
    h("label", { class: "f" }, h("span", {}, t("Email")), email), h("label", { class: "f" }, h("span", {}, t("Password")), pass),
    h("button", { class: "btn primary", type: "submit" }, t("Sign in")));
  return h("div", { class: "login" }, h("div", { class: "card" },
    h("div", { class: "bd col", style: { gap: "16px" } },
      h("div", { class: "row" }, h("div", { class: "brand", style: { padding: 0 } }, h("span", { class: "mark" }, "Q"), h("span", {}, "QuoteFlow", h("small", {}, t("Inquiry & quotation tracking")))), h("span", { class: "sp" }),
        h("button", { class: "btn sm", type: "button", onclick: () => { setLang(LANG === "ar" ? "en" : "ar"); render(); } }, LANG === "ar" ? "English" : "العربية")),
      form,
      h("div", { class: "small muted" }, t("Or pick a demo user"), " · ", t("All demo users use the password"), " ", h("code", { class: "mono" }, "demo1234")),
      h("div", { class: "demo-users" }, ...DEMO.map(([e, n, r]) => h("button", { type: "button", onclick: () => go(e, "demo1234") }, h("span", { class: "avatar" }, n.split(" ").filter(Boolean).slice(0, 2).map(s => s[0]).join("")), h("span", {}, h("div", { style: { fontWeight: 600 } }, n), h("div", { class: "xs muted" }, t(r), " · ", e))))),
      h("p", { class: "xs faint" }, t("Sample data. Company, people and figures are fictional."), app.api.mode === "local" ? " " + t("Running in your browser (SQLite via WebAssembly). Your changes stay on this device.") : ""))));
}
