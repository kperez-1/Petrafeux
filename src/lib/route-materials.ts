import { Db, Material, QuoteRoute, RouteMaterialLine } from "./types";
import { generateId } from "./utils";
import { materialSellFromBuyGp, DEFAULT_MATERIAL_GP_PERCENT } from "./margin-calc";
import { normalizeMaterialUnit } from "./types";

export function emptyMaterialLine(): RouteMaterialLine {
  return {
    id: generateId(),
    materialName: "",
    materialType: "",
    materialRate: 0,
    materialCost: 0,
    materialQty: 1,
    materialUnit: "TN",
  };
}

function hasLegacyMaterial(route: QuoteRoute): boolean {
  return Boolean(
    route.materialId ||
      route.materialName?.trim() ||
      route.materialRate > 0 ||
      route.materialCost > 0 ||
      route.materialQty > 0
  );
}

/** Ensure materialLines exists; migrate legacy single-material fields */
export function normalizeRouteMaterials(route: QuoteRoute): QuoteRoute {
  if (route.materialLines && route.materialLines.length > 0) {
    return syncRouteLegacyMaterial(route);
  }
  if (hasLegacyMaterial(route)) {
    return syncRouteLegacyMaterial({
      ...route,
      materialLines: [
        {
          id: `${route.id}-m0`,
          materialId: route.materialId,
          materialName: route.materialName ?? "",
          materialType: route.materialType ?? "",
          materialRate: route.materialRate,
          materialCost: route.materialCost,
          materialQty: route.materialQty,
          materialUnit: route.materialUnit,
        },
      ],
    });
  }
  return { ...route, materialLines: route.materialLines ?? [] };
}

export function getRouteMaterials(route: QuoteRoute): RouteMaterialLine[] {
  const normalized = normalizeRouteMaterials(route);
  return normalized.materialLines ?? [];
}

/** Quote material lines: materialRate = buy, materialCost = sell */
export function materialBuyFromLine(mat: RouteMaterialLine): number {
  return mat.materialRate;
}

export function materialSellFromLine(mat: RouteMaterialLine): number {
  return mat.materialCost;
}

export function resolveMaterialBuyRate(
  line: { materialBuyRate: number; materialLines?: RouteMaterialLine[] },
  materialLineId?: string
): number {
  if (line.materialLines?.length) {
    const mat = materialLineId
      ? line.materialLines.find((m) => m.id === materialLineId)
      : line.materialLines[0];
    if (mat) return materialBuyFromLine(mat);
  }
  return line.materialBuyRate;
}

export function resolveMaterialSellRate(
  line: { materialSellRate: number; materialLines?: RouteMaterialLine[] },
  materialLineId?: string
): number {
  if (line.materialLines?.length) {
    const mat = materialLineId
      ? line.materialLines.find((m) => m.id === materialLineId)
      : line.materialLines[0];
    if (mat) return materialSellFromLine(mat);
  }
  return line.materialSellRate;
}

/** Keep legacy flat fields aligned with first material line for storage compat */
export function syncRouteLegacyMaterial(route: QuoteRoute): QuoteRoute {
  const lines = route.materialLines ?? [];
  const first = lines[0];
  if (!first) {
    return {
      ...route,
      materialLines: lines,
      materialId: undefined,
      materialName: "",
      materialType: "",
      materialRate: 0,
      materialCost: 0,
      materialQty: 0,
      materialUnit: "TN",
    };
  }
  return {
    ...route,
    materialLines: lines,
    materialId: first.materialId,
    materialName: first.materialName,
    materialType: first.materialType,
    materialRate: first.materialRate,
    materialCost: first.materialCost,
    materialQty: first.materialQty,
    materialUnit: first.materialUnit,
  };
}

/** One catalog entry per material name (shared across quarries) */
export function catalogMaterials(materials: Material[]): Material[] {
  const byName = new Map<string, Material>();
  for (const m of materials) {
    const key = m.name.trim().toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, m);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function materialVendorIds(m: Material): string[] {
  if (m.vendorIds?.length) return m.vendorIds;
  return m.vendorId ? [m.vendorId] : [];
}

export function linkMaterialToVendor(material: Material, vendorId?: string): Material {
  if (!vendorId) return material;
  const ids = new Set(materialVendorIds(material));
  ids.add(vendorId);
  return {
    ...material,
    vendorId: material.vendorId || vendorId,
    vendorIds: [...ids],
  };
}

export function applyCatalogMaterialToLine(
  material: Material,
  gpPercent = DEFAULT_MATERIAL_GP_PERCENT
): Partial<RouteMaterialLine> {
  const buy = material.pricePerTon;
  return {
    materialId: material.id,
    materialName: material.name,
    materialType: material.type,
    materialRate: buy,
    materialCost: materialSellFromBuyGp(buy, gpPercent),
    materialUnit: normalizeMaterialUnit(material.priceUnit),
  };
}

export function upsertCatalogMaterial(
  db: Db,
  input: {
    name: string;
    type?: string;
    pricePerTon: number;
    priceUnit?: Material["priceUnit"];
    vendorId?: string;
  }
): { db: Db; material: Material } {
  const name = input.name.trim();
  const key = name.toLowerCase();
  const existing = db.materials.find((m) => m.name.trim().toLowerCase() === key);

  if (existing) {
    const linked = linkMaterialToVendor(existing, input.vendorId);
    const materials = db.materials.map((m) => (m.id === existing.id ? linked : m));
    return { db: { ...db, materials }, material: linked };
  }

  const vendorId = input.vendorId ?? "";
  const material: Material = {
    id: generateId(),
    vendorId,
    vendorIds: input.vendorId ? [input.vendorId] : [],
    name,
    type: input.type?.trim() ?? "",
    pricePerTon: input.pricePerTon,
    priceUnit: normalizeMaterialUnit(input.priceUnit),
  };

  return {
    db: { ...db, materials: [...db.materials, material] },
    material,
  };
}
