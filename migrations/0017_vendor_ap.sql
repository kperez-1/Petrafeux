-- Vendor AP (material quarries + disposal sites) and order line vendor snapshots

ALTER TABLE order_lines ADD COLUMN pickup_vendor_id TEXT;
ALTER TABLE order_lines ADD COLUMN dropoff_vendor_id TEXT;
ALTER TABLE order_lines ADD COLUMN disposal_buy_rate REAL DEFAULT 0;
ALTER TABLE order_lines ADD COLUMN disposal_sell_rate REAL DEFAULT 0;

ALTER TABLE quote_routes ADD COLUMN dropoff_vendor_id TEXT;
ALTER TABLE quote_routes ADD COLUMN disposal_cost REAL DEFAULT 0;
ALTER TABLE quote_routes ADD COLUMN disposal_rate REAL DEFAULT 0;

CREATE TABLE IF NOT EXISTS vendor_settlements (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  payee_kind TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  subtotal REAL DEFAULT 0,
  net_pay REAL DEFAULT 0,
  issued_at TEXT NOT NULL,
  lines_json TEXT DEFAULT '[]',
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);
