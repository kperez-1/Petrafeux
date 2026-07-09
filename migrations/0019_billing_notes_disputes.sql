ALTER TABLE activities ADD COLUMN customer_invoice_id TEXT;
ALTER TABLE activities ADD COLUMN carrier_settlement_id TEXT;
ALTER TABLE activities ADD COLUMN vendor_settlement_id TEXT;

ALTER TABLE customer_invoices ADD COLUMN notes_json TEXT;
ALTER TABLE carrier_settlements ADD COLUMN notes_json TEXT;
ALTER TABLE vendor_settlements ADD COLUMN notes_json TEXT;
ALTER TABLE vendor_settlements ADD COLUMN dispute_json TEXT;
