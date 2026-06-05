CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  subject TEXT NOT NULL,
  notes TEXT,
  scheduled_at TEXT NOT NULL,
  completed_at TEXT,
  project_id TEXT,
  contractor_id TEXT,
  company TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
