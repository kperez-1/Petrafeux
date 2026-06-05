CREATE TABLE IF NOT EXISTS project_bidders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  company TEXT NOT NULL,
  contractor_id TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  updated_at TEXT NOT NULL
);
