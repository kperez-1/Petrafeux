-- Email intake from Outlook .msg (optional; JSON file mode stores in petrafi-db.json)

CREATE TABLE IF NOT EXISTS project_email_intakes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  company TEXT NOT NULL,
  contractor_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  subject TEXT NOT NULL,
  from_name TEXT,
  from_email TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  signature_text TEXT,
  is_forwarded INTEGER DEFAULT 0,
  attachment_ids TEXT
);

CREATE TABLE IF NOT EXISTS email_attachments (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_key TEXT NOT NULL
);
