import { Db, VendorSettlement, VendorSettlementDispute } from "./types";

export interface DisputeVendorInput {
  reason: string;
  correctRate?: number;
  correctAmount?: number;
}

export function canDisputeVendorSettlement(settlement: VendorSettlement): boolean {
  return settlement.status === "draft" || settlement.status === "approved";
}

export function disputeVendorSettlement(
  db: Db,
  settlementId: string,
  input: DisputeVendorInput
): Db {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Dispute reason is required");

  const settlement = db.vendorSettlements.find((s) => s.id === settlementId);
  if (!settlement) throw new Error("Vendor payable not found");
  if (!canDisputeVendorSettlement(settlement)) {
    throw new Error("Only draft or approved payables can be disputed");
  }

  const dispute: VendorSettlementDispute = {
    reason,
    correctRate: input.correctRate,
    correctAmount: input.correctAmount,
    disputedAt: new Date().toISOString(),
  };

  return {
    ...db,
    vendorSettlements: db.vendorSettlements.map((s) =>
      s.id === settlementId ? { ...s, status: "disputed", dispute } : s
    ),
  };
}

export function resolveVendorDispute(db: Db, settlementId: string): Db {
  const settlement = db.vendorSettlements.find((s) => s.id === settlementId);
  if (!settlement) throw new Error("Vendor payable not found");
  if (settlement.status !== "disputed") throw new Error("Payable is not disputed");

  const resolvedDispute = settlement.dispute
    ? { ...settlement.dispute, resolvedAt: new Date().toISOString() }
    : undefined;

  return {
    ...db,
    vendorSettlements: db.vendorSettlements.map((s) =>
      s.id === settlementId
        ? {
            ...s,
            status: "approved",
            dispute: resolvedDispute,
          }
        : s
    ),
  };
}

export function assertCanMarkVendorPaid(settlement: VendorSettlement): void {
  if (settlement.status === "disputed") {
    throw new Error("Cannot mark paid while payable is disputed");
  }
}
