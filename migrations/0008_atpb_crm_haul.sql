-- Offices
CREATE TABLE IF NOT EXISTS offices (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  role TEXT DEFAULT 'salesperson',
  office_id TEXT,
  FOREIGN KEY (office_id) REFERENCES offices(id)
);

-- Project CRM columns
ALTER TABLE projects ADD COLUMN stage TEXT DEFAULT 'new';
ALTER TABLE projects ADD COLUMN archived INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN office_id TEXT;
ALTER TABLE projects ADD COLUMN salesperson_id TEXT;
ALTER TABLE projects ADD COLUMN updated_at TEXT;

-- Contractor linkage
ALTER TABLE contractors ADD COLUMN office_id TEXT;
ALTER TABLE contractors ADD COLUMN salesperson_id TEXT;
ALTER TABLE contractors ADD COLUMN contact_notes TEXT DEFAULT '';

-- Per-mile haul rates (new columns; legacy zone columns retained for migration)
ALTER TABLE haul_rates ADD COLUMN miles INTEGER;
ALTER TABLE haul_rates ADD COLUMN rate_per_load REAL;
