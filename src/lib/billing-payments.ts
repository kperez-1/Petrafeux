import {
  CarrierSettlement,
  CustomerInvoice,
  Db,
  PaymentDocumentKind,
  PaymentMethod,
  PaymentRecord,
  VendorSettlement,
} from "./types";
import { generateId } from "./utils";
import { assertCanMarkVendorPaid } from "./billing-disputes";

export interface RecordPaymentInput {
  method: PaymentMethod;
  amount: number;
  paidAt: string;
  reference?: string;
  note?: string;
  recordedByUserId?: string;
}

function appendPayment(
  existing: PaymentRecord[] | undefined,
  payment: PaymentRecord
): PaymentRecord[] {
  return [...(existing ?? []), payment];
}

export function recordInvoicePayment(
  db: Db,
  invoiceId: string,
  input: RecordPaymentInput
): Db {
  const invoice = db.customerInvoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "void") throw new Error("Cannot pay a void invoice");

  const payment: PaymentRecord = {
    id: generateId(),
    documentId: invoiceId,
    documentKind: "ar_invoice",
    method: input.method,
    amount: input.amount,
    paidAt: input.paidAt,
    reference: input.reference?.trim() || undefined,
    note: input.note?.trim() || undefined,
    recordedByUserId: input.recordedByUserId,
  };

  return {
    ...db,
    customerInvoices: db.customerInvoices.map((inv) =>
      inv.id === invoiceId
        ? { ...inv, status: "paid", payments: appendPayment(inv.payments, payment) }
        : inv
    ),
  };
}

export function recordCarrierSettlementPayment(
  db: Db,
  settlementId: string,
  input: RecordPaymentInput
): Db {
  const settlement = db.carrierSettlements.find((s) => s.id === settlementId);
  if (!settlement) throw new Error("Settlement not found");
  if (settlement.status !== "approved") {
    throw new Error("Settlement must be approved before payment");
  }

  const payment: PaymentRecord = {
    id: generateId(),
    documentId: settlementId,
    documentKind: "carrier_settlement",
    method: input.method,
    amount: input.amount,
    paidAt: input.paidAt,
    reference: input.reference?.trim() || undefined,
    note: input.note?.trim() || undefined,
    recordedByUserId: input.recordedByUserId,
  };

  return {
    ...db,
    carrierSettlements: db.carrierSettlements.map((s) =>
      s.id === settlementId
        ? { ...s, status: "paid", payments: appendPayment(s.payments, payment) }
        : s
    ),
  };
}

export function recordVendorSettlementPayment(
  db: Db,
  settlementId: string,
  input: RecordPaymentInput
): Db {
  const settlement = db.vendorSettlements.find((s) => s.id === settlementId);
  if (!settlement) throw new Error("Vendor payable not found");
  assertCanMarkVendorPaid(settlement);
  if (settlement.status !== "approved") {
    throw new Error("Payable must be approved before payment");
  }

  const payment: PaymentRecord = {
    id: generateId(),
    documentId: settlementId,
    documentKind: "vendor_settlement",
    method: input.method,
    amount: input.amount,
    paidAt: input.paidAt,
    reference: input.reference?.trim() || undefined,
    note: input.note?.trim() || undefined,
    recordedByUserId: input.recordedByUserId,
  };

  return {
    ...db,
    vendorSettlements: db.vendorSettlements.map((s) =>
      s.id === settlementId
        ? { ...s, status: "paid", payments: appendPayment(s.payments, payment) }
        : s
    ),
  };
}

export function recordPayment(
  db: Db,
  kind: PaymentDocumentKind,
  documentId: string,
  input: RecordPaymentInput
): Db {
  if (kind === "ar_invoice") return recordInvoicePayment(db, documentId, input);
  if (kind === "carrier_settlement") {
    return recordCarrierSettlementPayment(db, documentId, input);
  }
  return recordVendorSettlementPayment(db, documentId, input);
}

export function paymentTotal(doc: {
  payments?: PaymentRecord[];
  total?: number;
  netPay?: number;
}): number {
  if (doc.payments?.length) {
    return doc.payments.reduce((sum, p) => sum + p.amount, 0);
  }
  return doc.total ?? doc.netPay ?? 0;
}

export function defaultPaymentAmount(
  doc: CustomerInvoice | CarrierSettlement | VendorSettlement
): number {
  if ("total" in doc) return doc.total;
  return doc.netPay;
}
