// Sample dataset for a fictional technical-services company. Deterministic (seeded PRNG).
// Company, people, clients and figures are invented for demonstration purposes.
import { draftItems, computeTotals, SLA_HOURS } from "./estimator.js";

export const DEMO_PASSWORD = "demo1234";
export const DEMO_HASH = "pbkdf2$100000$736974656c6f672d64656d6f2d73616c74$c1518516014ed00eeb9fbc27d1c19b37b424ccc30559442d91dd95fbc6a52a89";

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const pad = n => String(n).padStart(2, "0");
const ts = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const addH = (d, h) => new Date(d.getTime() + h * 36e5);

export const COMPANY = {
  name_ar: "شركة مراسم للخدمات الفنية", name_en: "Marasim Technical Services Co.", cr_no: "1010XXXXXX", vat_no: "3001XXXXXXXXXX3", city: "Riyadh", address: "Al-Olaya District, Riyadh 12211", phone: "+966 11 XXX XXXX", email: "quotes@marasim.example",
  bank_name: "Example Bank", iban: "SA00 0000 0000 0000 0000 0000",
  quote_terms: "Prices in SAR excluding VAT unless stated. Validity 30 days. Payment: 50% advance, 50% on completion. Site access, water and power by client. Quantities are re-measured on site.",
  quote_validity_days: 30, vat_rate: 15,
};

export const USERS = [
  { name: "Nour Al-Dossari", email: "nour@marasim.example", role: "admin", phone: "+9665XXXXXX10" },
  { name: "Tariq Al-Mutairi", email: "tariq@marasim.example", role: "manager", phone: "+9665XXXXXX11" },
  { name: "Lina Haddad", email: "lina@marasim.example", role: "sales", phone: "+9665XXXXXX12" },
  { name: "Yazan Khalil", email: "yazan@marasim.example", role: "sales", phone: "+9665XXXXXX13" },
  { name: "Eng. Hani Mostafa", email: "hani@marasim.example", role: "estimator", phone: "+9665XXXXXX14" },
  { name: "Eng. Mona Saeed", email: "mona@marasim.example", role: "estimator", phone: "+9665XXXXXX15" },
];

export const SERVICES = [
  ["CUT-WALL", "قص جدران خرسانية بالمنشار", "Concrete wall saw cutting", "cutting", "m", 320],
  ["CUT-SLAB", "قص بلاطات/فتحات أسقف", "Slab cutting / openings", "cutting", "m", 380],
  ["CORE-100", "كور خرساني قطر 100 مم", "Concrete coring Ø100 mm", "coring", "nos", 180],
  ["CORE-150", "كور خرساني قطر 150 مم", "Concrete coring Ø150 mm", "coring", "nos", 240],
  ["CORE-200", "كور خرساني قطر 200 مم", "Concrete coring Ø200 mm", "coring", "nos", 320],
  ["CORE-GEN", "كور خرساني (قطر حسب الموقع)", "Concrete coring (diameter per site)", "coring", "nos", 220],
  ["DEMO-CONC", "هدم وإزالة خرسانة", "Concrete demolition & removal", "demolition", "m3", 650],
  ["WP-ROOF", "عزل مائي للأسطح (ممبرين)", "Roof waterproofing (membrane)", "waterproofing", "m2", 95],
  ["WP-INJ", "حقن شروخ بالإيبوكسي", "Epoxy crack injection", "waterproofing", "m", 140],
  ["CFRP", "تدعيم بألياف الكربون CFRP", "CFRP strengthening", "strengthening", "m2", 1150],
  ["GPR-SCAN", "مسح خرسانة بالرادار GPR", "GPR concrete scanning", "scanning", "m2", 35],
  ["HVAC-MAINT", "صيانة تكييف (عقد شهري)", "HVAC maintenance (monthly)", "mep", "month", 4500],
  ["ELEC-MAINT", "أعمال وصيانة كهرباء", "Electrical works & maintenance", "mep", "ls", 8000],
  ["PLUMB", "أعمال سباكة ومعالجة تسريبات", "Plumbing & leak repair", "mep", "ls", 3500],
  ["FITOUT", "أعمال تشطيب وقواطع", "Fit-out & partitions", "fitout", "m2", 420],
  ["MOBIL", "تجهيز ونقل معدات", "Mobilization & demobilization", "general", "ls", 2500],
];

export const CLIENTS = [
  ["شركة الراجحي للمقاولات", "Al-Rajhi Contracting Co.", "contractor", "Riyadh", "Eng. Abdullah", "+9665XXXXXX21", "abdullah@rajhi-cont.example"],
  ["مجموعة ديار للتطوير", "Diyar Development Group", "developer", "Jeddah", "Mr. Sami", "+9665XXXXXX22", "sami@diyar.example"],
  ["أمانة منطقة الرياض", "Riyadh Region Municipality", "government", "Riyadh", "Eng. Fahad", "+9661XXXXXX23", "projects@amana.example"],
  ["مستشفى النور التخصصي", "Al-Noor Specialist Hospital", "facility", "Riyadh", "Mr. Khaled (FM)", "+9665XXXXXX24", "fm@alnoor.example"],
  ["شركة البناء الحديث", "Modern Build Co.", "contractor", "Dammam", "Eng. Waleed", "+9665XXXXXX25", "waleed@modernbuild.example"],
  ["مول الواحة", "Al-Waha Mall", "facility", "Riyadh", "Ms. Reem (Operations)", "+9665XXXXXX26", "ops@wahamall.example"],
  ["شركة إعمار الخليج", "Gulf Emaar Co.", "developer", "Riyadh", "Mr. Nasser", "+9665XXXXXX27", "nasser@gulfemaar.example"],
  ["جامعة الملك سلمان – الصيانة", "King Salman University – Maintenance", "government", "Riyadh", "Eng. Saad", "+9661XXXXXX28", "maint@ksu.example"],
  ["شركة سما للمقاولات", "Sama Contracting", "contractor", "Jeddah", "Eng. Omar", "+9665XXXXXX29", "omar@sama.example"],
  ["فندق المدينة بلازا", "Madinah Plaza Hotel", "facility", "Madinah", "Mr. Hassan (Chief Eng.)", "+9665XXXXXX30", "eng@plaza.example"],
  ["شركة المراعي – مصنع الخرج", "Dairy Co. – Al-Kharj Plant", "facility", "Al-Kharj", "Eng. Ali", "+9665XXXXXX31", "plant@dairy.example"],
  ["مؤسسة النخبة للمقاولات", "Elite Contracting Est.", "contractor", "Riyadh", "Mr. Majed", "+9665XXXXXX32", "majed@elite.example"],
  ["شركة الطاقة المتجددة", "Renewable Energy Co.", "developer", "Dammam", "Eng. Youssef", "+9665XXXXXX33", "youssef@renew.example"],
  ["مدارس الرواد الأهلية", "Al-Rowad Private Schools", "facility", "Riyadh", "Mr. Turki", "+9665XXXXXX34", "admin@rowad.example"],
];

const INQ_TEMPLATES = [
  ["Coring for MEP sleeves – {loc}", "نحتاج كور لفتحات التمديدات في {loc}", "We need coring of 40 holes Ø150 mm and 25 holes Ø100 mm in the basement slab for MEP sleeves. Drawings attached. Required within 2 weeks.", 9000, 16000],
  ["Wall cutting for new door openings", "قص جدران لفتحات أبواب جديدة", "قص جدران خرسانية بالمنشار 36 م.ط لعمل 4 فتحات أبواب في الدور الأرضي مع إزالة الخرسانة. العمل ليلي.", 10000, 18000],
  ["Roof waterproofing – {loc}", "عزل سطح – {loc}", "Roof area approx 850 m2 with existing membrane damaged. Need removal, new membrane and water test.", 60000, 95000],
  ["Slab opening for escalator", "فتحة سقف لسلم متحرك", "Slab cutting 18 m for a 6x3 m opening at level 1, plus demolition and removal of about 9 m3 concrete. Shoring by others.", 12000, 20000],
  ["Crack injection – parking structure", "حقن شروخ – مواقف السيارات", "حقن شروخ ايبوكسي بطول 220 متر تقريبا في بلاطة مواقف السيارات مع تقرير فحص.", 25000, 40000],
  ["CFRP strengthening of beams", "تدعيم كمرات بألياف الكربون", "Strengthening of 12 beams with CFRP sheets, approx 90 m2, as per consultant drawings. Site in operation; works after hours.", 90000, 130000],
  ["GPR scanning before coring", "مسح رادار قبل الكور", "GPR scanning of about 600 m2 of slab to locate post-tension cables before coring works.", 15000, 25000],
  ["HVAC maintenance contract", "عقد صيانة تكييف", "طلب عرض سعر لعقد صيانة تكييف سنوي لمبنى إداري 6 أدوار، 48 وحدة سبليت و2 تشلر، زيارات شهرية.", 45000, 60000],
  ["Electrical panel replacement", "استبدال لوحات كهرباء", "Replacement of 3 DB panels and re-termination, plus thermal imaging report for main LV panel.", 15000, 30000],
  ["Leak repair – basement", "معالجة تسريب – البدروم", "تسريب مياه في جدار البدروم بطول 15 متر تقريبا، مطلوب معالجة وحقن مع ضمان.", 8000, 15000],
  ["Fit-out of new office floor", "تشطيب دور مكاتب جديد", "Fit-out of 420 m2 office floor: gypsum partitions, ceilings, painting, flooring. Design provided.", 150000, 220000],
  ["Demolition of RC water tank", "هدم خزان خرساني", "Demolition and removal of an abandoned RC water tank, approx 60 m3 concrete, on roof level. Crane access limited.", 35000, 55000],
];
const LOCS = ["Riyadh – Olaya tower", "Jeddah – Corniche project", "Dammam – logistics park", "Riyadh – north compound", "KAFD plot 3", "Madinah – hotel annex"];
const LOCS_AR = ["برج العليا – الرياض", "مشروع الكورنيش – جدة", "المنطقة اللوجستية – الدمام", "مجمع الشمال – الرياض", "مركز الملك عبدالله المالي", "ملحق الفندق – المدينة"];
const LOST = ["Price higher than competitor", "Client postponed the project", "Awarded to incumbent contractor", "Scope changed / no longer required", "No response after follow-ups"];

export function buildSeed({ today = new Date(), days = 120 } = {}) {
  const rand = rng(20261019);
  const pick = a => a[Math.floor(rand() * a.length)];
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const inquiries = [];
  const start = new Date(today); start.setDate(start.getDate() - days);
  const salesIdx = [2, 3], estIdx = [4, 5];
  let n = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (d.getDay() === 5) continue;
    const count = rand() < 0.3 ? 0 : between(1, 2);
    for (let k = 0; k < count; k++) {
      n++;
      const tpl = pick(INQ_TEMPLATES); const li = Math.floor(rand() * LOCS.length);
      const received = new Date(d); received.setHours(between(7, 17), between(0, 59));
      const ageH = (today - received) / 36e5;
      const priority = pick(["normal", "normal", "normal", "high", "high", "urgent", "low"]);
      const sla = SLA_HOURS[priority];
      const sales = pick(salesIdx), est = pick(estIdx);
      // lifecycle
      const respRoll = rand();
      const respH = respRoll < 0.8 ? sla * rand() * 0.9 : respRoll < 0.92 ? sla * (1.1 + rand()) : Infinity;
      const responded = ageH > respH;
      let status = "new";
      let quotedAt = null, closedAt = null, lostReason = null, firstResp = responded ? ts(addH(received, respH)) : null;
      if (!responded && ageH > 240) { status = "cancelled"; closedAt = ts(addH(received, 240)); lostReason = null; }
      if (responded) {
        status = "assigned";
        const quoteH = respH + between(12, 96);
        if (ageH > quoteH) { status = "quoted"; quotedAt = ts(addH(received, quoteH)); }
        else status = pick(["assigned", "site_visit", "quoting", "quoting"]);
        if (status === "quoted") {
          const decideH = quoteH + between(96, 720);
          if (ageH > decideH) {
            const r = rand();
            if (r < 0.45) status = "won"; else if (r < 0.85) status = "lost"; else if (r < 0.92) status = "cancelled"; else status = ageH - decideH < 240 ? "negotiation" : "lost";
            if (["won", "lost", "cancelled"].includes(status)) { closedAt = ts(addH(received, decideH)); if (status === "lost") lostReason = pick(LOST); }
          } else if (rand() < 0.2) status = "negotiation";
        }
      }
      inquiries.push({ inq_no: `INQ-${received.getFullYear()}-${pad(n).padStart(4, "0")}`, client_idx: Math.floor(rand() * CLIENTS.length), received_at: ts(received), channel: pick(["whatsapp", "whatsapp", "email", "phone", "site_visit", "portal", "referral"]),
        subject: tpl[0].replace("{loc}", LOCS[li]), subject_ar: tpl[1].replace("{loc}", LOCS_AR[li]), details: tpl[2], location: LOCS[li], required_by: ts(addH(received, between(240, 900))).slice(0, 10), priority, sla_hours: sla,
        status, assigned_to: responded ? sales : null, estimator: est, first_response_at: firstResp, quoted_at: quotedAt, closed_at: closedAt, lost_reason: lostReason, est_value: between(tpl[3], tpl[4]), created_by: sales, rand: rand() });
    }
  }
  return { company: COMPANY, users: USERS, services: SERVICES, clients: CLIENTS, inquiries };
}

export function applySeed(dbx, opts = {}) {
  const data = buildSeed(opts);
  const today = opts.today || new Date();
  const rand = rng(777); const between = (a, b) => a + Math.floor(rand() * (b - a + 1)); const pick = a => a[Math.floor(rand() * a.length)];
  dbx.tx(() => {
    for (const t of ["audit_log", "activity", "followups", "quotation_items", "quotations", "inquiries", "services", "clients", "users", "company"]) dbx.run(`DELETE FROM ${t}`);
    dbx.run("DELETE FROM sqlite_sequence");
    const c = data.company;
    dbx.run("INSERT INTO company (id,name_ar,name_en,cr_no,vat_no,city,address,phone,email,bank_name,iban,quote_terms,quote_validity_days,vat_rate) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?)", [c.name_ar, c.name_en, c.cr_no, c.vat_no, c.city, c.address, c.phone, c.email, c.bank_name, c.iban, c.quote_terms, c.quote_validity_days, c.vat_rate]);
    const uid = data.users.map(u => dbx.run("INSERT INTO users (name,email,phone,role,password_hash) VALUES (?,?,?,?,?)", [u.name, u.email, u.phone, u.role, DEMO_HASH]).lastId);
    const sid = {}; const services = [];
    for (const [code, ar, en, cat, unit, rate] of data.services) { const id = dbx.run("INSERT INTO services (code,name_ar,name_en,category,unit,base_rate) VALUES (?,?,?,?,?,?)", [code, ar, en, cat, unit, rate]).lastId; sid[code] = id; services.push({ id, code, name_ar: ar, name_en: en, unit, base_rate: rate }); }
    const cid = data.clients.map(([ar, en, type, city, contact, phone, email]) => dbx.run("INSERT INTO clients (name_ar,name_en,type,city,contact_name,phone,email) VALUES (?,?,?,?,?,?,?)", [ar, en, type, city, contact, phone, email]).lastId);
    let qn = 0;
    for (const q of data.inquiries) {
      const iid = dbx.run("INSERT INTO inquiries (inq_no,client_id,received_at,channel,subject,details,location,required_by,priority,status,assigned_to,sla_hours,first_response_at,quoted_at,closed_at,est_value,lost_reason,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [q.inq_no, cid[q.client_idx], q.received_at, q.channel, q.subject, q.details, q.location, q.required_by, q.priority, q.status, q.assigned_to != null ? uid[q.assigned_to] : null, q.sla_hours, q.first_response_at, q.quoted_at, q.closed_at, q.est_value, q.lost_reason, uid[q.created_by], q.closed_at || q.quoted_at || q.first_response_at || q.received_at]).lastId;
      dbx.run("INSERT INTO activity (inquiry_id,at,user_id,type,text) VALUES (?,?,?,?,?)", [iid, q.received_at, uid[q.created_by], "received", `Inquiry received via ${q.channel}`]);
      if (q.first_response_at) { dbx.run("INSERT INTO activity (inquiry_id,at,user_id,type,text) VALUES (?,?,?,?,?)", [iid, q.first_response_at, uid[q.assigned_to], "assigned", `Assigned to ${data.users[q.assigned_to].name}; client acknowledged`]); }
      if (["quoted", "won", "lost", "negotiation", "cancelled"].includes(q.status) && q.quoted_at) {
        qn++;
        const items = draftItems(q.details, services).map(it => ({ ...it, qty: it.qty, rate: Math.round(it.rate * (0.92 + rand() * 0.2)) }));
        if (!items.length) items.push({ service_id: null, description: q.subject, unit: "ls", qty: 1, rate: q.est_value });
        const disc = rand() < 0.3 ? pick([2.5, 5, 7.5]) : 0;
        const tot = computeTotals(items, { discount_pct: disc, vat_rate: 15 });
        const qstatus = q.status === "won" ? "accepted" : q.status === "lost" ? "rejected" : q.status === "cancelled" ? "expired" : "sent";
        const valid = new Date(q.quoted_at.replace(" ", "T")); valid.setDate(valid.getDate() + 30);
        const qid = dbx.run("INSERT INTO quotations (quote_no,revision,inquiry_id,status,issued_at,valid_until,vat_rate,discount_pct,subtotal,discount,vat,total,scope_notes,terms,prepared_by,approved_by,approved_at,sent_at,decided_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [`QT-${q.quoted_at.slice(0, 4)}-${String(qn).padStart(4, "0")}`, 0, iid, qstatus, q.quoted_at, valid.toISOString().slice(0, 10), 15, disc, tot.subtotal, tot.discount, tot.vat, tot.total, q.details.slice(0, 160), c.quote_terms, uid[q.estimator], uid[1], q.quoted_at, q.quoted_at, q.closed_at]).lastId;
        tot.lines.forEach((l, i) => dbx.run("INSERT INTO quotation_items (quotation_id,service_id,description,unit,qty,rate,amount,sort) VALUES (?,?,?,?,?,?,?,?)", [qid, l.service_id, l.description, l.unit, l.qty, l.rate, l.amount, i]));
        dbx.run("UPDATE inquiries SET est_value=? WHERE id=?", [tot.total, iid]);
        dbx.run("INSERT INTO activity (inquiry_id,at,user_id,type,text) VALUES (?,?,?,?,?)", [iid, q.quoted_at, uid[q.estimator], "quoted", `Quotation sent · ${tot.total.toLocaleString("en-US")} SAR`]);
        if (q.closed_at) dbx.run("INSERT INTO activity (inquiry_id,at,user_id,type,text) VALUES (?,?,?,?,?)", [iid, q.closed_at, uid[q.assigned_to], q.status, q.status === "won" ? "Client accepted the quotation" : q.status === "lost" ? `Lost: ${q.lost_reason}` : "Cancelled by client"]);
        // follow-ups for open quotes
        if (["quoted", "negotiation"].includes(q.status)) {
          const due1 = new Date(q.quoted_at.replace(" ", "T")); due1.setDate(due1.getDate() + 3);
          const done = due1 < today && rand() < 0.7;
          dbx.run("INSERT INTO followups (inquiry_id,due_at,type,note,user_id,done_at,outcome) VALUES (?,?,?,?,?,?,?)", [iid, ts(due1), pick(["call", "whatsapp", "email"]), "Follow up on quotation", uid[q.assigned_to], done ? ts(addH(due1, 3)) : null, done ? pick(["Client reviewing with management", "Asked for discount", "Will confirm next week"]) : null]);
          if (done) { const due2 = new Date(due1); due2.setDate(due2.getDate() + 5); dbx.run("INSERT INTO followups (inquiry_id,due_at,type,note,user_id) VALUES (?,?,?,?,?)", [iid, ts(due2), "call", "Second follow-up", uid[q.assigned_to]]); }
        }
      }
      if (["assigned", "site_visit", "quoting"].includes(q.status)) {
        const due = new Date(q.first_response_at.replace(" ", "T")); due.setDate(due.getDate() + between(1, 4));
        dbx.run("INSERT INTO followups (inquiry_id,due_at,type,note,user_id) VALUES (?,?,?,?,?)", [iid, ts(due), q.status === "site_visit" ? "visit" : "call", q.status === "site_visit" ? "Site visit to measure quantities" : "Confirm scope with client", uid[q.assigned_to]]);
      }
    }
    dbx.run("INSERT INTO audit_log (action,entity,detail) VALUES ('seed','database','Sample data loaded')");
  });
  return data;
}
