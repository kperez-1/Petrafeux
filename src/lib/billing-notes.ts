import { BillingNote, Db } from "./types";
import { generateId } from "./utils";

function appendNote(existing: BillingNote[] | undefined, body: string): BillingNote[] {
  const note: BillingNote = {
    id: generateId(),
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
  return [...(existing ?? []), note];
}

export function addInvoiceNote(db: Db, invoiceId: string, body: string): Db {
  if (!body.trim()) return db;
  return {
    ...db,
    customerInvoices: db.customerInvoices.map((inv) =>
      inv.id === invoiceId ? { ...inv, notes: appendNote(inv.notes, body) } : inv
    ),
  };
}

export function addCarrierSettlementNote(
  db: Db,
  settlementId: string,
  body: string
): Db {
  if (!body.trim()) return db;
  return {
    ...db,
    carrierSettlements: db.carrierSettlements.map((s) =>
      s.id === settlementId ? { ...s, notes: appendNote(s.notes, body) } : s
    ),
  };
}

export function addVendorSettlementNote(
  db: Db,
  settlementId: string,
  body: string
): Db {
  if (!body.trim()) return db;
  return {
    ...db,
    vendorSettlements: db.vendorSettlements.map((s) =>
      s.id === settlementId ? { ...s, notes: appendNote(s.notes, body) } : s
    ),
  };
}
