ALTER TABLE quotes ADD COLUMN sent_at TEXT;
ALTER TABLE quotes ADD COLUMN history_json TEXT DEFAULT '[]';

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('default_tax_rate', '7');
INSERT OR IGNORE INTO app_meta (key, value) VALUES ('haul_broker_fee_percent', '10');
INSERT OR IGNORE INTO app_meta (key, value) VALUES ('haul_sell_margin_percent', '15');
INSERT OR IGNORE INTO app_meta (key, value) VALUES ('org_name', 'AT of Palm Beach');
INSERT OR IGNORE INTO app_meta (key, value) VALUES ('org_code', 'ATPB');
