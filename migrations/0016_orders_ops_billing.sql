CREATE TABLE IF NOT EXISTS carriers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  office_id TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  contractor_id TEXT,
  job_name TEXT NOT NULL,
  tax_rate REAL DEFAULT 7,
  status TEXT DEFAULT 'open',
  office_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (quote_id) REFERENCES quotes(id)
);

CREATE TABLE IF NOT EXISTS order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  quote_route_id TEXT,
  pickup_address TEXT DEFAULT '',
  dropoff_address TEXT DEFAULT '',
  material_name TEXT,
  material_buy_rate REAL DEFAULT 0,
  material_sell_rate REAL DEFAULT 0,
  material_unit TEXT DEFAULT 'TN',
  material_qty_quoted REAL DEFAULT 0,
  material_lines TEXT,
  haul_buy_rate REAL DEFAULT 0,
  haul_sell_rate REAL DEFAULT 0,
  haul_unit TEXT DEFAULT 'TN',
  haul_qty_quoted REAL DEFAULT 0,
  taxable INTEGER DEFAULT 1,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_line_id TEXT NOT NULL,
  carrier_id TEXT NOT NULL,
  status TEXT DEFAULT 'assigned',
  assigned_at TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (carrier_id) REFERENCES carriers(id)
);

CREATE TABLE IF NOT EXISTS delivery_tickets (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  order_line_id TEXT NOT NULL,
  line_type TEXT NOT NULL,
  material_line_id TEXT,
  ticket_number TEXT,
  qty REAL NOT NULL,
  unit TEXT DEFAULT 'TN',
  delivered_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending_review',
  ticket_image_url TEXT,
  FOREIGN KEY (dispatch_id) REFERENCES dispatches(id)
);

CREATE TABLE IF NOT EXISTS customer_invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  contractor_id TEXT,
  status TEXT DEFAULT 'draft',
  subtotal REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  issued_at TEXT NOT NULL,
  due_date TEXT,
  lines_json TEXT DEFAULT '[]',
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS carrier_settlements (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  carrier_id TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  subtotal REAL DEFAULT 0,
  broker_fee REAL DEFAULT 0,
  net_pay REAL DEFAULT 0,
  issued_at TEXT NOT NULL,
  lines_json TEXT DEFAULT '[]',
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (carrier_id) REFERENCES carriers(id)
);
