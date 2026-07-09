-- Ops parity with staging: trips, order fields, ticket fields, dispatch fields

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  dispatch_id TEXT NOT NULL,
  carrier_id TEXT NOT NULL,
  truck_label TEXT,
  driver_name TEXT,
  status TEXT DEFAULT 'assigned',
  scheduled_date TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (dispatch_id) REFERENCES dispatches(id)
);

ALTER TABLE orders ADD COLUMN scheduled_at TEXT;
ALTER TABLE orders ADD COLUMN created_by_user_id TEXT;
ALTER TABLE orders ADD COLUMN salesperson_id TEXT;
ALTER TABLE orders ADD COLUMN tax_exempt INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN tax_exempt_number TEXT;
ALTER TABLE orders ADD COLUMN history_json TEXT DEFAULT '[]';

ALTER TABLE dispatches ADD COLUMN trip_id TEXT;
ALTER TABLE dispatches ADD COLUMN truck_label TEXT;
ALTER TABLE dispatches ADD COLUMN scheduled_date TEXT;

ALTER TABLE delivery_tickets ADD COLUMN number TEXT;
ALTER TABLE delivery_tickets ADD COLUMN trip_id TEXT;
ALTER TABLE delivery_tickets ADD COLUMN paper_ticket_number TEXT;
ALTER TABLE delivery_tickets ADD COLUMN rejected_at TEXT;
ALTER TABLE delivery_tickets ADD COLUMN approved_by_user_id TEXT;
ALTER TABLE delivery_tickets ADD COLUMN driver_sell_rate REAL;
ALTER TABLE delivery_tickets ADD COLUMN notes TEXT;
