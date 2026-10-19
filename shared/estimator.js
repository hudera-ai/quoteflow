// Draft-quotation assistant: reads an inquiry's free text (Arabic / English) and proposes
// line items from the company's service catalogue, with quantities and units when they are
// stated. Deterministic and dependency-free; an LLM can be plugged in on the server.

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const normDigits = s => s.replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)));
const norm = s => normDigits(s).replace(/[ً-ْـ]/g, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Each service code → keyword aliases (AR/EN). Mirrors the seeded catalogue in shared/seed.js.
export const SERVICE_KEYWORDS = {
  "CUT-WALL":   ["wall saw", "wall cutting", "saw cutting", "cut wall", "cutting of wall", "قص جدار", "قص جدران", "قص حوائط", "قص خرساني", "قص"],
  "CUT-SLAB":   ["slab cutting", "floor saw", "cut slab", "opening in slab", "slab opening", "قص سقف", "قص بلاطه", "فتحه سقف", "فتحات سقف"],
  "CORE-100":   ["coring 100", "core 100", "ø100", "100mm", "100 mm", "كور 100", "كور قطر 100", "قطر 100", "ثقب 100"],
  "CORE-150":   ["coring 150", "core 150", "ø150", "150mm", "150 mm", "كور 150", "كور قطر 150", "قطر 150"],
  "CORE-200":   ["coring 200", "core 200", "ø200", "200mm", "200 mm", "كور 200", "كور قطر 200", "قطر 200"],
  "CORE-GEN":   ["coring", "core drilling", "core holes", "holes", "كور", "تخريم", "ثقوب", "ثقب"],
  "DEMO-CONC":  ["demolition", "demolish", "breaking", "removal of concrete", "هدم", "تكسير", "ازاله خرسانه"],
  "WP-ROOF":    ["roof waterproofing", "waterproofing", "membrane", "عزل سطح", "عزل اسطح", "عزل مائي", "عزل"],
  "WP-INJ":     ["injection", "crack injection", "epoxy injection", "حقن", "حقن شروخ", "شروخ"],
  "CFRP":       ["cfrp", "carbon fibre", "carbon fiber", "strengthening", "تدعيم", "الياف كربون", "كربون"],
  "GPR-SCAN":   ["gpr", "scanning", "scan", "rebar scan", "ground penetrating", "مسح", "سكان", "فحص رادار"],
  "HVAC-MAINT": ["hvac", "ac maintenance", "air conditioning", "chiller", "تكييف", "صيانه تكييف", "تشلر"],
  "ELEC-MAINT": ["electrical maintenance", "electrical works", "panels", "panel", "db panels", "db panel", "thermal imaging", "اعمال كهرباء", "صيانه كهرباء", "لوحه كهرباء"],
  "PLUMB":      ["plumbing", "leak", "pipes", "سباكه", "تسريب", "مواسير"],
  "FITOUT":     ["fit-out", "fitout", "fit out", "partition", "gypsum", "تشطيب", "قواطع", "جبس"],
  "MOBIL":      ["mobilization", "mobilisation", "تجهيز", "نقل معدات"],
};

export const UNIT_WORDS = [
  ["m",   ["m", "lm", "rm", "meter", "meters", "metre", "متر", "م.ط", "مط", "متر طولي"]],
  ["m2",  ["m2", "m²", "sqm", "square meter", "متر مربع", "م2", "م٢"]],
  ["m3",  ["m3", "m³", "cum", "cubic", "متر مكعب", "م3", "م٣"]],
  ["nos", ["nos", "no", "pcs", "holes", "hole", "points", "point", "units", "unit", "عدد", "نقطه", "نقاط", "ثقب", "ثقوب", "وحده", "وحدات"]],
  ["ls",  ["lump sum", "ls", "مقطوعيه", "مقطوع"]],
  ["visit", ["visit", "visits", "زياره", "زيارات"]],
  ["month", ["month", "months", "شهر", "شهور", "اشهر"]],
];

// First "<number> <unit>" anywhere in the text whose unit matches the service's unit.
const UNIT_RE = {
  m2: /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|sqm|متر مربع|م2|م٢)(?![\p{L}\d])/iu,
  m3: /(\d+(?:[.,]\d+)?)\s*(?:m3|m³|cum|متر مكعب|م3|م٣)(?![\p{L}\d])/iu,
  m:  /(\d+(?:[.,]\d+)?)\s*(?:lm|rm|m|meters?|metres?|متر طولي|م\.ط|مط|متر)(?![\p{L}\d²³])/iu,
  nos: /(\d+)\s*(?:holes?|nos|pcs|points?|units?|beams?|panels?|نقطه|نقاط|ثقوب|ثقب|عدد|كمرات|لوحات|وحدات|وحده)(?![\p{L}\d])/iu,
  month: /(\d+)\s*(?:months?|شهور|اشهر|شهر)/iu,
};
function qtyByUnit(t, unit) {
  if (unit === "month" && /annual|yearly|سنوي/u.test(t)) return 12;
  const re = UNIT_RE[unit]; if (!re) return null;
  const m = re.exec(t); return m ? parseFloat(m[1].replace(",", ".")) : null;
}

// Quantity for a matched service: prefer "<number> <unit>" pairs whose unit matches the
// service unit (nearest to the keyword), then the same pattern anywhere in the text, then a
// bare number next to the keyword that is not a diameter ("Ø150", "قطر 150", "150 mm").
function qtyFor(t, idx, unit) {
  const lo = Math.max(0, idx - 40), win = t.slice(lo, idx + 70);
  const pairs = [];
  for (const [u, words] of UNIT_WORDS) for (const w of words) {
    const re = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${esc(norm(w))}(?![\\p{L}\\d²³])`, "giu");
    let m; while ((m = re.exec(win))) pairs.push({ qty: parseFloat(m[1].replace(",", ".")), u, pos: lo + m.index });
  }
  const same = pairs.filter(p => p.u === unit).sort((a, b) => Math.abs(a.pos - idx) - Math.abs(b.pos - idx));
  if (same.length) return same[0].qty;
  const anywhere = qtyByUnit(t, unit); if (anywhere) return anywhere;
  const bare = [];
  const re = /(?<![ø\d])(\d+(?:[.,]\d+)?)(?!\s*(?:mm|ملم|مم|x|×))/giu; let m;
  while ((m = re.exec(win))) { const before = win.slice(Math.max(0, m.index - 6), m.index); if (/ø|قطر|dia/iu.test(before)) continue; if (pairs.some(p => p.pos === lo + m.index)) continue; bare.push({ qty: parseFloat(m[1].replace(",", ".")), pos: lo + m.index }); }
  bare.sort((a, b) => Math.abs(a.pos - idx) - Math.abs(b.pos - idx));
  return bare.length ? bare[0].qty : null;
}

export function draftItems(text, services) {
  const t = norm(text || "");
  const byCode = Object.fromEntries(services.map(s => [s.code, s]));
  const found = [];
  for (const [code, words] of Object.entries(SERVICE_KEYWORDS)) {
    const svc = byCode[code]; if (!svc) continue;
    for (const w of words) {
      const re = new RegExp(`(^|[^\\p{L}]|(?<![\\p{L}])و)${esc(norm(w))}(?=$|[^\\p{L}])`, "iu");
      const m = re.exec(t);
      if (m) { found.push({ code, idx: m.index + m[1].length, len: w.length }); break; }
    }
  }
  // CORE-GEN only if no specific diameter matched; generic "قص" only if no specific cut matched
  const codes = new Set(found.map(f => f.code));
  const drop = new Set();
  if (["CORE-100", "CORE-150", "CORE-200"].some(c => codes.has(c))) drop.add("CORE-GEN");
  if (codes.has("CUT-SLAB") && codes.has("CUT-WALL")) { const w = found.find(f => f.code === "CUT-WALL"); if (w.len <= 2) drop.add("CUT-WALL"); }
  const items = found.filter(f => !drop.has(f.code)).sort((a, b) => a.idx - b.idx).map(f => {
    const svc = byCode[f.code];
    const qty = qtyFor(t, f.idx, svc.unit);
    return { service_id: svc.id, code: svc.code, description: svc.name_en, description_ar: svc.name_ar, unit: svc.unit, qty: qty && qty > 0 ? qty : 1, rate: svc.base_rate, confidence: qty ? "high" : "medium" };
  });
  if (items.length && !items.some(i => i.code === "MOBIL") && byCode.MOBIL && items.some(i => /^(CUT|CORE|DEMO|CFRP|GPR)/.test(i.code))) items.push({ service_id: byCode.MOBIL.id, code: "MOBIL", description: byCode.MOBIL.name_en, description_ar: byCode.MOBIL.name_ar, unit: byCode.MOBIL.unit, qty: 1, rate: byCode.MOBIL.base_rate, confidence: "suggested" });
  return items;
}

// Totals: subtotal → discount → VAT → total, rounded to 2 dp.
export function computeTotals(items, { discount_pct = 0, vat_rate = 15 } = {}) {
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const lines = items.map(i => ({ ...i, amount: r2((Number(i.qty) || 0) * (Number(i.rate) || 0)) }));
  const subtotal = r2(lines.reduce((a, b) => a + b.amount, 0));
  const discount = r2(subtotal * (Number(discount_pct) || 0) / 100);
  const vat = r2((subtotal - discount) * (Number(vat_rate) || 0) / 100);
  return { lines, subtotal, discount, vat, total: r2(subtotal - discount + vat) };
}

// SLA helpers
export const SLA_HOURS = { urgent: 4, high: 24, normal: 48, low: 72 };
export function slaState(inq, now = new Date()) {
  const due = new Date(inq.received_at.replace(" ", "T") + (inq.received_at.length === 19 ? "Z" : "")); due.setHours(due.getHours() + (inq.sla_hours || 48));
  const responded = !!inq.first_response_at;
  const left = (due - now) / 36e5;
  return { due: due.toISOString().slice(0, 19).replace("T", " "), responded, overdue: !responded && left < 0, hours_left: responded ? null : +left.toFixed(1), at_risk: !responded && left > 0 && left < 6 };
}
export function hoursBetween(a, b) { if (!a || !b) return null; return +((new Date(b.replace(" ", "T") + "Z") - new Date(a.replace(" ", "T") + "Z")) / 36e5).toFixed(1); }
