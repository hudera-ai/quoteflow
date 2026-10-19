-- QuoteFlow · inquiry → quotation → follow-up for service companies
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL, cr_no TEXT, vat_no TEXT, city TEXT, address TEXT, phone TEXT, email TEXT,
  bank_name TEXT, iban TEXT, quote_terms TEXT, quote_validity_days INTEGER NOT NULL DEFAULT 30, vat_rate REAL NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','sales','estimator')),
  password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'contractor' CHECK (type IN ('contractor','developer','government','facility','individual')),
  city TEXT, contact_name TEXT, phone TEXT, email TEXT, vat_no TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  category TEXT NOT NULL, unit TEXT NOT NULL, base_rate REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inq_no TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email','phone','site_visit','portal','referral')),
  subject TEXT NOT NULL, details TEXT, location TEXT, required_by TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','assigned','site_visit','quoting','quoted','negotiation','won','lost','cancelled')),
  assigned_to INTEGER REFERENCES users(id),
  sla_hours INTEGER NOT NULL DEFAULT 48,
  first_response_at TEXT, quoted_at TEXT, closed_at TEXT,
  est_value REAL DEFAULT 0, lost_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','sent','accepted','rejected','expired','superseded')),
  issued_at TEXT, valid_until TEXT,
  currency TEXT NOT NULL DEFAULT 'SAR', vat_rate REAL NOT NULL DEFAULT 15, discount_pct REAL NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, vat REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
  scope_notes TEXT, terms TEXT, internal_notes TEXT,
  prepared_by INTEGER REFERENCES users(id), approved_by INTEGER REFERENCES users(id), approved_at TEXT, sent_at TEXT, decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (quote_no, revision)
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  description TEXT NOT NULL, unit TEXT NOT NULL, qty REAL NOT NULL DEFAULT 1, rate REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  due_at TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'call' CHECK (type IN ('call','whatsapp','email','visit','meeting')),
  note TEXT, user_id INTEGER REFERENCES users(id), done_at TEXT, outcome TEXT
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL, text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_inq_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inq_client ON inquiries(client_id);
CREATE INDEX IF NOT EXISTS idx_quote_inq ON quotations(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_fu_due ON followups(due_at, done_at);
