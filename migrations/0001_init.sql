CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contractors (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  type TEXT DEFAULT 'quarry'
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  vendor_id TEXT,
  name TEXT NOT NULL,
  type TEXT DEFAULT '',
  price_per_ton REAL DEFAULT 0,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS haul_rates (
  id TEXT PRIMARY KEY,
  zone_name TEXT NOT NULL,
  min_miles REAL DEFAULT 0,
  max_miles REAL DEFAULT 0,
  rate_per_ton REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  number TEXT NOT NULL UNIQUE,
  job_name TEXT NOT NULL,
  contractor_id TEXT,
  status TEXT DEFAULT 'unsent',
  tax_rate REAL DEFAULT 7,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (contractor_id) REFERENCES contractors(id)
);

CREATE TABLE IF NOT EXISTS quote_routes (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  pickup_address TEXT DEFAULT '',
  dropoff_address TEXT DEFAULT '',
  haul_rate REAL DEFAULT 0,
  haul_cost REAL DEFAULT 0,
  haul_qty REAL DEFAULT 0,
  material_id TEXT,
  material_name TEXT DEFAULT '',
  material_type TEXT DEFAULT '',
  material_rate REAL DEFAULT 0,
  material_cost REAL DEFAULT 0,
  material_qty REAL DEFAULT 0,
  taxable INTEGER DEFAULT 1,
  FOREIGN KEY (quote_id) REFERENCES quotes(id)
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('quote_counter', '0');
