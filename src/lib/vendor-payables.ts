import { Db, DeliveryTicket, OrderLine, Vendor } from "./types";
import { resolveMaterialBuyRate } from "./route-materials";

/** Match dropoff/pickup address to a vendor record */
export function resolveVendorByAddress(
  db: Db,
  address: string,
  type?: Vendor["type"]
): Vendor | undefined {
  const trimmed = address.trim().toLowerCase();
  if (!trimmed) return undefined;
  return db.vendors.find((v) => {
    if (type && v.type !== type) return false;
    const addr = v.address.trim().toLowerCase();
    const name = v.name.trim().toLowerCase();
    return addr === trimmed || name === trimmed || (addr && trimmed.includes(addr));
  });
}

export function getVendor(db: Db, vendorId: string): Vendor | undefined {
  return db.vendors.find((v) => v.id === vendorId);
}

export function vendorPayeeLabel(vendor: Vendor | undefined, kind: "material" | "disposal"): string {
  if (!vendor) return kind === "material" ? "Material vendor" : "Disposal vendor";
  if (kind === "disposal" || vendor.type === "disposal") return `${vendor.name} (disposal)`;
  return `${vendor.name} (material)`;
}

/** Vendor owed for a material or disposal ticket */
export function vendorIdForTicket(
  db: Db,
  orderLine: OrderLine,
  ticket: DeliveryTicket
): string | undefined {
  if (ticket.lineType === "disposal") {
    return orderLine.dropoffVendorId ?? resolveVendorByAddress(db, orderLine.dropoffAddress, "disposal")?.id;
  }
  if (ticket.lineType === "material") {
    if (orderLine.pickupVendorId) return orderLine.pickupVendorId;
    if (ticket.materialLineId && orderLine.materialLines) {
      const mat = orderLine.materialLines.find((m) => m.id === ticket.materialLineId);
      if (mat?.materialId) {
        const catalog = db.materials.find((m) => m.id === mat.materialId);
        if (catalog?.vendorId) return catalog.vendorId;
        if (catalog?.vendorIds?.length) return catalog.vendorIds[0];
      }
    }
    const pickup = resolveVendorByAddress(db, orderLine.pickupAddress, "quarry");
    if (pickup) return pickup.id;
  }
  return undefined;
}

export function payeeKindForTicket(ticket: DeliveryTicket): "material" | "disposal" {
  return ticket.lineType === "disposal" ? "disposal" : "material";
}

export function buyRateForVendorTicket(orderLine: OrderLine, ticket: DeliveryTicket): number {
  if (ticket.lineType === "disposal") return orderLine.disposalBuyRate ?? 0;
  return resolveMaterialBuyRate(orderLine, ticket.materialLineId);
}
