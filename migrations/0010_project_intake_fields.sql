-- Project fields for email intake source company / due date

ALTER TABLE projects ADD COLUMN source_company TEXT;
ALTER TABLE projects ADD COLUMN source_contractor_id TEXT;
ALTER TABLE projects ADD COLUMN intake_due_date TEXT;
