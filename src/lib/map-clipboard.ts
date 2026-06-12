import { Db, QuoteRoute, RouteMaterialLine } from "./types";
import { generateId, ceilCents, roundCents } from "./utils";
import { getBrokerFeePercent } from "./db-defaults";
import {
  DEFAULT_HAUL_GP_PERCENT,
  DEFAULT_MATERIAL_GP_PERCENT,
  haulSellFromBuyGp,
  materialSellFromBuyGp,
} from "./quote-calc";
import { haulBuyRateForUnit } from "./haul-pricing";
import {
  applyCatalogMaterialToLine,
  emptyMaterialLine,
  getRouteMaterials,
  syncRouteLegacyMaterial,
  upsertCatalogMaterial,
} from "./route-materials";
import { Vendor, Material, MaterialPriceUnit } from "./types";

export interface JobHaulInfo {
  miles: number;
  ratePerLoad: number | null;
  ratePerTon: number | null;
  approximate: boolean;
}

/** A line the user has staged on the map to apply to a quote. */
export interface MapClipboardItem {
  id: string;
  vendor: Vendor;
  /** "material" = existing catalog item, "custom" = ad-hoc material, "haul" = hauling-only */
  kind: "material" | "custom" | "haul";
  material?: Material;
  custom?: { name: string; buy: number; unit: MaterialPriceUnit; saveToVendor: boolean };
  qty: number;
  /** Snapshot of the haul estimate at the moment it was staged. */
  haul: JobHaulInfo | null;
}

function emptyRoute(quoteId: string, sortOrder: number): QuoteRoute {
  return {
    id: generateId(),
    quoteId,
    sortOrder,
    pickupAddress: "",
    dropoffAddress: "",
    haulRate: 0,
    haulCost: 0,
    haulQty: 1,
    haulUnit: "TN",
    materialId: undefined,
    materialName: "",
    materialType: "",
    materialRate: 0,
    materialCost: 0,
    materialQty: 1,
    materialUnit: "TN",
    materialLines: [],
    taxable: true,
  };
}

/** Derive a short project label from a street address. */
export function defaultProjectNameFromAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return "New Project";
  return trimmed.split(",")[0]?.trim() || trimmed;
}

/**
 * Collapse staged map clipboard items into quote routes (one route per vendor → job site).
 * Persists custom materials marked "save to vendor" on the returned db snapshot.
 */
export function applyMapClipboardToRoutes(
  db: Db,
  items: MapClipboardItem[],
  dropoffAddress: string,
  quoteId: string,
  existingRoutes: QuoteRoute[] = []
): { db: Db; routes: QuoteRoute[] } {
  if (items.length === 0) {
    return { db, routes: existingRoutes };
  }

  const dropoff = dropoffAddress.trim();
  const brokerFeePercent = getBrokerFeePercent(db.meta);

  let workingDb = db;
  const lineForItem = new Map<string, RouteMaterialLine | null>();
  for (const item of items) {
    if (item.kind === "material" && item.material) {
      const patch = applyCatalogMaterialToLine(item.material);
      lineForItem.set(item.id, {
        ...emptyMaterialLine(),
        ...patch,
        materialCost: roundCents(patch.materialCost ?? 0),
      });
    } else if (item.kind === "custom" && item.custom) {
      if (item.custom.saveToVendor) {
        const res = upsertCatalogMaterial(workingDb, {
          name: item.custom.name,
          pricePerTon: item.custom.buy,
          priceUnit: item.custom.unit,
          vendorId: item.vendor.id,
        });
        workingDb = res.db;
        const patch = applyCatalogMaterialToLine(res.material);
        lineForItem.set(item.id, {
          ...emptyMaterialLine(),
          ...patch,
          materialCost: roundCents(patch.materialCost ?? 0),
        });
      } else {
        lineForItem.set(item.id, {
          ...emptyMaterialLine(),
          materialName: item.custom.name,
          materialType: "",
          materialRate: item.custom.buy,
          materialCost: roundCents(
            materialSellFromBuyGp(item.custom.buy, DEFAULT_MATERIAL_GP_PERCENT)
          ),
          materialUnit: item.custom.unit,
        });
      }
    } else {
      lineForItem.set(item.id, null);
    }
  }

  const order: string[] = [];
  const byVendor = new Map<string, MapClipboardItem[]>();
  for (const item of items) {
    if (!byVendor.has(item.vendor.id)) {
      byVendor.set(item.vendor.id, []);
      order.push(item.vendor.id);
    }
    byVendor.get(item.vendor.id)!.push(item);
  }

  function haulRatesFromSnapshot(group: MapClipboardItem[]) {
    const snap = group.find((g) => g.haul && g.haul.ratePerLoad != null)?.haul;
    if (!snap || snap.ratePerLoad == null) return null;
    const buy = ceilCents(haulBuyRateForUnit(snap.ratePerLoad, "TN"));
    return {
      haulCost: buy,
      haulRate: roundCents(haulSellFromBuyGp(buy, brokerFeePercent, DEFAULT_HAUL_GP_PERCENT)),
    };
  }

  const next = [...existingRoutes];
  for (const vendorId of order) {
    const group = byVendor.get(vendorId)!;
    const vendor = group[0].vendor;
    const newLines = group
      .map((it) => lineForItem.get(it.id))
      .filter((l): l is RouteMaterialLine => Boolean(l));
    const haul = haulRatesFromSnapshot(group);

    const existingIdx = next.findIndex(
      (r) => r.pickupVendorId === vendorId && (r.dropoffAddress ?? "") === dropoff
    );

    if (existingIdx >= 0) {
      const existing = next[existingIdx];
      const mergedLines = [...getRouteMaterials(existing), ...newLines];
      const needsHaul = !existing.haulCost || existing.haulCost === 0;
      next[existingIdx] = syncRouteLegacyMaterial({
        ...existing,
        ...(needsHaul && haul ? haul : {}),
        materialLines: mergedLines,
      });
    } else {
      next.push(
        syncRouteLegacyMaterial({
          ...emptyRoute(quoteId, next.length),
          pickupAddress: vendor.address,
          pickupVendorId: vendor.id,
          dropoffAddress: dropoff,
          haulRate: haul?.haulRate ?? 0,
          haulCost: haul?.haulCost ?? 0,
          materialLines: newLines,
        })
      );
    }
  }

  return { db: workingDb, routes: next };
}
