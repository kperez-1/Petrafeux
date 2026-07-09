import { Db, VendorSettlement, VendorSettlementLine } from "./types";
import { generateId } from "./utils";
import { generateVendorSettlementNumber } from "./storage";
import { getVendor } from "./vendor-payables";
import { computeDueDate, paymentTermsDaysForVendor } from "./payee-terms";
import { normalizeMaterialUnit } from "./types";

export interface ManualVendorBillInput {
  vendorId: string;
  vendorInvoiceNumber: string;
  vendorInvoiceDate: string;
  dueDate?: string;
  amount: number;
  description?: string;
  orderId?: string;
  payeeKind?: VendorSettlement["payeeKind"];
}

export function findDuplicateVendorBill(
  db: Db,
  vendorId: string,
  vendorInvoiceNumber: string
): VendorSettlement | undefined {
  const key = vendorInvoiceNumber.trim().toLowerCase();
  if (!key) return undefined;
  return db.vendorSettlements.find(
    (s) =>
      s.vendorId === vendorId &&
      s.vendorInvoiceNumber?.trim().toLowerCase() === key &&
      s.status !== "paid"
  );
}

export function createManualVendorBill(
  db: Db,
  input: ManualVendorBillInput
): { db: Db; settlement: VendorSettlement } {
  const vendor = getVendor(db, input.vendorId);
  if (!vendor) throw new Error("Vendor not found");

  const invoiceNumber = input.vendorInvoiceNumber.trim();
  if (!invoiceNumber) throw new Error("Vendor invoice number is required");

  const duplicate = findDuplicateVendorBill(db, input.vendorId, invoiceNumber);
  if (duplicate) {
    throw new Error(
      `Duplicate vendor invoice ${invoiceNumber} already exists (${duplicate.number})`
    );
  }

  const amount = Math.round(input.amount * 100) / 100;
  if (amount <= 0) throw new Error("Amount must be greater than zero");

  const issuedAt = new Date(input.vendorInvoiceDate).toISOString();
  const terms = paymentTermsDaysForVendor(vendor);
  const dueDate =
    input.dueDate?.trim() ||
    computeDueDate(input.vendorInvoiceDate, terms);

  const line: VendorSettlementLine = {
    id: generateId(),
    description: input.description?.trim() || `Vendor invoice ${invoiceNumber}`,
    qty: 1,
    unit: normalizeMaterialUnit("LD"),
    buyRate: amount,
    amount,
  };

  const counter = (db.meta.vendorSettlementCounter ?? 0) + 1;
  const settlement: VendorSettlement = {
    id: generateId(),
    number: generateVendorSettlementNumber(counter),
    orderId: input.orderId,
    vendorId: input.vendorId,
    payeeKind: input.payeeKind ?? "material",
    status: "draft",
    subtotal: amount,
    netPay: amount,
    issuedAt,
    dueDate,
    vendorInvoiceNumber: invoiceNumber,
    vendorInvoiceDate: input.vendorInvoiceDate,
    lines: [line],
    source: "manual",
  };

  return {
    db: {
      ...db,
      vendorSettlements: [settlement, ...db.vendorSettlements],
      meta: { ...db.meta, vendorSettlementCounter: counter },
    },
    settlement,
  };
}
