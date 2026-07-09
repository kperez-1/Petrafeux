import { CarrierSettlement, Db, VendorSettlement } from "./types";
import { getCarrier } from "./dispatch";
import { getVendor } from "./vendor-payables";
import {
  computeDueDate,
  paymentTermsDaysForCarrier,
  paymentTermsDaysForVendor,
} from "./payee-terms";
import { assertCanMarkVendorPaid } from "./billing-disputes";

export function approveCarrierSettlement(
  db: Db,
  settlementId: string,
  approvedByUserId?: string
): Db {
  const settlement = db.carrierSettlements.find((s) => s.id === settlementId);
  if (!settlement) throw new Error("Settlement not found");
  if (settlement.status !== "draft") throw new Error("Only draft settlements can be approved");

  const carrier = getCarrier(db, settlement.carrierId);
  const now = new Date().toISOString();
  const dueDate = computeDueDate(now, paymentTermsDaysForCarrier(carrier));

  return {
    ...db,
    carrierSettlements: db.carrierSettlements.map((s) =>
      s.id === settlementId
        ? {
            ...s,
            status: "approved",
            approvedAt: now,
            approvedByUserId,
            dueDate,
          }
        : s
    ),
  };
}

export function approveVendorSettlement(
  db: Db,
  settlementId: string,
  approvedByUserId?: string
): Db {
  const settlement = db.vendorSettlements.find((s) => s.id === settlementId);
  if (!settlement) throw new Error("Vendor payable not found");
  if (settlement.status !== "draft") throw new Error("Only draft payables can be approved");

  const vendor = getVendor(db, settlement.vendorId);
  const now = new Date().toISOString();
  const baseDate = settlement.vendorInvoiceDate || settlement.issuedAt;
  const dueDate =
    settlement.dueDate ||
    computeDueDate(baseDate, paymentTermsDaysForVendor(vendor));

  return {
    ...db,
    vendorSettlements: db.vendorSettlements.map((s) =>
      s.id === settlementId
        ? {
            ...s,
            status: "approved",
            approvedAt: now,
            approvedByUserId,
            dueDate,
          }
        : s
    ),
  };
}

export function markInvoiceSent(
  db: Db,
  invoiceId: string,
  sentByUserId?: string
): Db {
  const now = new Date().toISOString();
  return {
    ...db,
    customerInvoices: db.customerInvoices.map((inv) =>
      inv.id === invoiceId
        ? { ...inv, status: "sent", sentAt: now, sentByUserId }
        : inv
    ),
  };
}

export function canPayCarrierSettlement(s: CarrierSettlement): boolean {
  return s.status === "approved";
}

export function canPayVendorSettlement(s: VendorSettlement): boolean {
  try {
    assertCanMarkVendorPaid(s);
    return s.status === "approved";
  } catch {
    return false;
  }
}
