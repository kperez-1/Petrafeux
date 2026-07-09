-- Payee master (vendor/carrier AP profile fields)
ALTER TABLE vendors ADD COLUMN contact_name TEXT;
ALTER TABLE vendors ADD COLUMN contact_email TEXT;
ALTER TABLE vendors ADD COLUMN contact_phone TEXT;
ALTER TABLE vendors ADD COLUMN payment_terms_days INTEGER;
ALTER TABLE vendors ADD COLUMN tax_id TEXT;
ALTER TABLE vendors ADD COLUMN w9_on_file INTEGER DEFAULT 0;
ALTER TABLE vendors ADD COLUMN w9_file_url TEXT;

ALTER TABLE carriers ADD COLUMN payment_terms_days INTEGER;
ALTER TABLE carriers ADD COLUMN tax_id TEXT;
ALTER TABLE carriers ADD COLUMN w9_on_file INTEGER DEFAULT 0;
ALTER TABLE carriers ADD COLUMN w9_file_url TEXT;

-- AP/AR payment and approval fields
ALTER TABLE carrier_settlements ADD COLUMN due_date TEXT;
ALTER TABLE carrier_settlements ADD COLUMN payments_json TEXT;
ALTER TABLE carrier_settlements ADD COLUMN approved_by_user_id TEXT;
ALTER TABLE carrier_settlements ADD COLUMN approved_at TEXT;

ALTER TABLE customer_invoices ADD COLUMN payments_json TEXT;
ALTER TABLE customer_invoices ADD COLUMN sent_by_user_id TEXT;
ALTER TABLE customer_invoices ADD COLUMN sent_at TEXT;
ALTER TABLE customer_invoices ADD COLUMN attachment_url TEXT;
ALTER TABLE customer_invoices ADD COLUMN source TEXT DEFAULT 'ticket';

-- Allow manual vendor payables without an order (rebuild table)
CREATE TABLE IF NOT EXISTS vendor_settlements_v2 (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  order_id TEXT,
  vendor_id TEXT NOT NULL,
  payee_kind TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  subtotal REAL DEFAULT 0,
  net_pay REAL DEFAULT 0,
  issued_at TEXT NOT NULL,
  lines_json TEXT DEFAULT '[]',
  notes_json TEXT,
  dispute_json TEXT,
  due_date TEXT,
  vendor_invoice_number TEXT,
  vendor_invoice_date TEXT,
  payments_json TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  source TEXT DEFAULT 'ticket',
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

INSERT INTO vendor_settlements_v2 (
  id, number, order_id, vendor_id, payee_kind, status, subtotal, net_pay, issued_at,
  lines_json, notes_json, dispute_json
)
SELECT
  id, number, order_id, vendor_id, payee_kind, status, subtotal, net_pay, issued_at,
  lines_json, notes_json, dispute_json
FROM vendor_settlements;

DROP TABLE vendor_settlements;
ALTER TABLE vendor_settlements_v2 RENAME TO vendor_settlements;
