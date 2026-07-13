import { Db, Order, OrderLine, Quote, QuoteRoute, RouteMaterialLine } from "./types";
import { generateId } from "./utils";
import { generateOrderNumber } from "./storage";
import { getRouteMaterials, materialSellFromLine, normalizeRouteMaterials } from "./route-materials";
import { resolveVendorByAddress } from "./vendor-payables";

export interface OrderLineSelection {
  quoteRouteId: string;
  /** When omitted, line is haul-only (no material on this dispatch). */
  materialLineId?: string;
  qty: number;
}

export interface CreateOrderWizardItem {
  quoteRouteId: string;
  materialLineId?: string;
  label: string;
  haulSellRate: number;
  materialSellRate: number;
  unit: string;
  defaultQty: number;
  orderedQty: number;
}

function findQuoteRoute(quote: Quote, routeId: string): QuoteRoute | undefined {
  return quote.routes.find((r) => r.id === routeId);
}

function snapshotMaterialLine(
  db: Db,
  orderId: string,
  route: QuoteRoute,
  material: RouteMaterialLine,
  qty: number,
  sortOrder: number
): OrderLine {
  const dropoffVendorId =
    route.dropoffVendorId ??
    resolveVendorByAddress(db, route.dropoffAddress, "disposal")?.id;
  const mat: RouteMaterialLine = { ...material, materialQty: qty };
  return {
    id: generateId(),
    orderId,
    sortOrder,
    quoteRouteId: route.id,
    pickupAddress: route.pickupAddress,
    dropoffAddress: route.dropoffAddress,
    pickupVendorId: route.pickupVendorId,
    dropoffVendorId,
    materialName: mat.materialName,
    materialBuyRate: mat.materialRate,
    materialSellRate: mat.materialCost,
    materialUnit: mat.materialUnit ?? route.materialUnit,
    materialQtyQuoted: qty,
    materialLines: [mat],
    disposalBuyRate: route.disposalCost ?? 0,
    disposalSellRate: route.disposalRate ?? 0,
    haulBuyRate: route.haulCost ?? 0,
    haulSellRate: route.haulRate ?? 0,
    haulUnit: route.haulUnit,
    haulQtyQuoted: qty,
    taxable: route.taxable ?? true,
  };
}

function snapshotHaulOnlyLine(
  db: Db,
  orderId: string,
  route: QuoteRoute,
  qty: number,
  sortOrder: number
): OrderLine {
  const dropoffVendorId =
    route.dropoffVendorId ??
    resolveVendorByAddress(db, route.dropoffAddress, "disposal")?.id;
  return {
    id: generateId(),
    orderId,
    sortOrder,
    quoteRouteId: route.id,
    pickupAddress: route.pickupAddress,
    dropoffAddress: route.dropoffAddress,
    pickupVendorId: route.pickupVendorId,
    dropoffVendorId,
    materialName: undefined,
    materialBuyRate: 0,
    materialSellRate: 0,
    materialUnit: route.materialUnit,
    materialQtyQuoted: 0,
    disposalBuyRate: route.disposalCost ?? 0,
    disposalSellRate: route.disposalRate ?? 0,
    haulBuyRate: route.haulCost ?? 0,
    haulSellRate: route.haulRate ?? 0,
    haulUnit: route.haulUnit,
    haulQtyQuoted: qty,
    taxable: route.taxable ?? true,
  };
}

export function orderedQtyForRouteMaterial(
  db: Db,
  quoteId: string,
  quoteRouteId: string,
  materialLineId: string
): number {
  return db.orders
    .filter((o) => o.quoteId === quoteId)
    .flatMap((o) => o.lines)
    .filter((l) => l.quoteRouteId === quoteRouteId)
    .reduce((sum, line) => {
      const mat = line.materialLines?.find((m) => m.id === materialLineId);
      if (mat) return sum + mat.materialQty;
      if (line.materialLines?.length === 1 && line.materialLines[0].id === materialLineId) {
        return sum + line.materialQtyQuoted;
      }
      return sum;
    }, 0);
}

export function wizardItemsForRoutes(
  db: Db,
  quote: Quote,
  routeIds: string[]
): CreateOrderWizardItem[] {
  const items: CreateOrderWizardItem[] = [];
  for (const routeId of routeIds) {
    const route = findQuoteRoute(quote, routeId);
    if (!route) continue;
    const normalized = normalizeRouteMaterials(route);
    const materials = getRouteMaterials(normalized);
    if (materials.length === 0) {
      items.push({
        quoteRouteId: route.id,
        label: "Hauling",
        haulSellRate: route.haulRate ?? 0,
        materialSellRate: 0,
        unit: route.haulUnit ?? "TN",
        defaultQty: route.haulQty ?? 1,
        orderedQty: 0,
      });
      continue;
    }
    for (const mat of materials) {
      items.push({
        quoteRouteId: route.id,
        materialLineId: mat.id,
        label: mat.materialName?.trim() || "Material",
        haulSellRate: route.haulRate ?? 0,
        materialSellRate: materialSellFromLine(mat),
        unit: mat.materialUnit ?? route.materialUnit ?? "TN",
        defaultQty: mat.materialQty || 1,
        orderedQty: orderedQtyForRouteMaterial(db, quote.id, route.id, mat.id),
      });
    }
  }
  return items;
}

export function selectionSubtotal(
  route: QuoteRoute,
  selection: OrderLineSelection,
  material?: RouteMaterialLine
): number {
  const qty = selection.qty;
  if (material) {
    return (
      Math.round(route.haulRate * qty * 100) / 100 +
      Math.round(material.materialCost * qty * 100) / 100
    );
  }
  return Math.round(route.haulRate * qty * 100) / 100;
}

export function selectionsSubtotal(
  quote: Quote,
  selections: OrderLineSelection[]
): number {
  return selections.reduce((sum, sel) => {
    const route = findQuoteRoute(quote, sel.quoteRouteId);
    if (!route) return sum;
    const materials = getRouteMaterials(normalizeRouteMaterials(route));
    const mat = sel.materialLineId
      ? materials.find((m) => m.id === sel.materialLineId)
      : undefined;
    return sum + selectionSubtotal(route, sel, mat);
  }, 0);
}

export function selectionsTotalWithTax(
  quote: Quote,
  selections: OrderLineSelection[]
): { subtotal: number; tax: number; total: number } {
  const subtotal = selectionsSubtotal(quote, selections);
  let taxableMaterial = 0;
  for (const sel of selections) {
    if (sel.qty <= 0) continue;
    const route = findQuoteRoute(quote, sel.quoteRouteId);
    if (!route?.taxable) continue;
    const materials = getRouteMaterials(normalizeRouteMaterials(route));
    const mat = sel.materialLineId
      ? materials.find((m) => m.id === sel.materialLineId)
      : undefined;
    if (mat) taxableMaterial += mat.materialCost * sel.qty;
  }
  const tax = Math.round(taxableMaterial * (quote.taxRate / 100) * 100) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

export function routeDisplayLabel(db: Db, route: QuoteRoute, index: number): string {
  const pickupVendor = route.pickupVendorId
    ? db.vendors.find((v) => v.id === route.pickupVendorId)
    : undefined;
  const pickup = pickupVendor?.name || route.pickupAddress.trim() || "Pickup";
  const dropoff = route.dropoffAddress.trim() || "Dropoff";
  return `Route ${index + 1}: ${pickup} → ${dropoff}`;
}

export function createOrderFromSelections(
  db: Db,
  quoteId: string,
  selections: OrderLineSelection[],
  opts?: { createdByUserId?: string; scheduledAt?: string; notes?: string }
): { db: Db; order: Order } {
  const quote = db.quotes.find((q) => q.id === quoteId);
  if (!quote) throw new Error("Quote not found");
  if (quote.status !== "approved") throw new Error("Only approved quotes can become orders");
  if (selections.length === 0) throw new Error("Select at least one route and material");

  const lines: OrderLine[] = [];
  const orderId = generateId();

  selections.forEach((sel, index) => {
    if (sel.qty <= 0) return;
    const route = findQuoteRoute(quote, sel.quoteRouteId);
    if (!route) throw new Error("Route not found on quote");
    if (sel.materialLineId) {
      const materials = getRouteMaterials(normalizeRouteMaterials(route));
      const mat = materials.find((m) => m.id === sel.materialLineId);
      if (!mat) throw new Error("Material not found on route");
      lines.push(snapshotMaterialLine(db, orderId, route, mat, sel.qty, index));
    } else {
      lines.push(snapshotHaulOnlyLine(db, orderId, route, sel.qty, index));
    }
  });

  if (lines.length === 0) throw new Error("Enter a quantity greater than zero");

  const counter = (db.meta.orderCounter ?? 0) + 1;
  const project = db.projects.find((p) => p.id === quote.projectId);
  const now = new Date().toISOString();

  const order: Order = {
    id: orderId,
    number: generateOrderNumber(counter),
    projectId: quote.projectId,
    quoteId: quote.id,
    contractorId: quote.contractorId,
    jobName: quote.jobName,
    taxRate: quote.taxRate,
    status: "pending",
    lines,
    createdAt: now,
    officeId: project?.officeId,
    scheduledAt: opts?.scheduledAt,
    createdByUserId: opts?.createdByUserId ?? db.meta.currentUserId,
    salespersonId: project?.salespersonId,
    history: [
      {
        id: generateId(),
        type: "created",
        at: now,
        userId: opts?.createdByUserId,
        note: opts?.notes,
      },
    ],
  };

  return {
    db: {
      ...db,
      orders: [order, ...db.orders],
      meta: { ...db.meta, orderCounter: counter },
    },
    order,
  };
}

/** @deprecated Use createOrderFromSelections — creates one order with all quote routes. */
export function createOrderFromQuote(
  db: Db,
  quoteId: string,
  opts?: { createdByUserId?: string; scheduledAt?: string }
): { db: Db; order: Order } {
  const quote = db.quotes.find((q) => q.id === quoteId);
  if (!quote) throw new Error("Quote not found");
  const selections: OrderLineSelection[] = [];
  for (const route of quote.routes) {
    const materials = getRouteMaterials(normalizeRouteMaterials(route));
    if (materials.length === 0) {
      selections.push({
        quoteRouteId: route.id,
        qty: route.haulQty ?? 1,
      });
    } else {
      for (const mat of materials) {
        selections.push({
          quoteRouteId: route.id,
          materialLineId: mat.id,
          qty: mat.materialQty || 1,
        });
      }
    }
  }
  return createOrderFromSelections(db, quoteId, selections, opts);
}
