ALTER TABLE quote_routes ADD COLUMN pickup_vendor_id TEXT;
ALTER TABLE quote_routes ADD COLUMN haul_unit TEXT DEFAULT 'TN';
ALTER TABLE quote_routes ADD COLUMN material_unit TEXT DEFAULT 'TN';
