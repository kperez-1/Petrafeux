-- Email intake sessions + attachment bytes for Cloudflare Workers (no local fs)

CREATE TABLE IF NOT EXISTS email_intake_sessions (
  id TEXT PRIMARY KEY,
  meta_json TEXT NOT NULL DEFAULT '{}',
  files_json TEXT NOT NULL DEFAULT '{}'
);

ALTER TABLE email_attachments ADD COLUMN content_base64 TEXT;
