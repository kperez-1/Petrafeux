import {
  Db,
  Order,
  OrderHistoryEvent,
  OrderLine,
  OrderStatus,
  Quote,
} from "./types";
import { generateId } from "./utils";
import { generateOrderNumber } from "./storage";
import { getRouteMaterials, normalizeRouteMaterials } from "./route-materials";
import { resolveVendorByAddress } from "./vendor-payables";
import { normalizeOrderStatus } from "./order-status";

function materialQtyForRoute(route: Quote["routes"][0]): number {
  const materials = getRouteMaterials(normalizeRouteMaterials(route));
  if (materials.length > 0) {
    return materials.reduce((sum, m) => sum + (m.materialQty || 0), 0);
  }
  return route.materialQty || 0;
}

function snapshotLine(db: Db, orderId: string, route: Quote["routes"][0], sortOrder: number): OrderLine {
  const normalized = normalizeRouteMaterials(route);
  const materials = getRouteMaterials(normalized);
  const first = materials[0];
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
    materialName: first?.materialName || route.materialName,
    materialBuyRate: first?.materialCost ?? route.materialCost ?? 0,
    materialSellRate: first?.materialRate ?? route.materialRate ?? 0,
    materialUnit: first?.materialUnit ?? route.materialUnit,
    materialQtyQuoted: materialQtyForRoute(route),
    materialLines: materials.length > 0 ? materials : undefined,
    disposalBuyRate: route.disposalCost ?? 0,
    disposalSellRate: route.disposalRate ?? 0,
    haulBuyRate: route.haulCost ?? 0,
    haulSellRate: route.haulRate ?? 0,
    haulUnit: route.haulUnit,
    haulQtyQuoted: route.haulQty ?? 0,
    taxable: route.taxable ?? true,
  };
}

export function getOrder(db: Db, orderId: string): Order | undefined {
  return db.orders.find((o) => o.id === orderId);
}

export function ordersForProject(db: Db, projectId: string): Order[] {
  return db.orders.filter((o) => o.projectId === projectId);
}

export function allOrders(db: Db, officeId?: string): Order[] {
  if (!officeId) return db.orders;
  return db.orders.filter((o) => !o.officeId || o.officeId === officeId);
}

function appendHistory(order: Order, event: Omit<OrderHistoryEvent, "id">): OrderHistoryEvent[] {
  const list = order.history ?? [];
  return [...list, { id: generateId(), ...event }];
}

export function createOrderFromQuote(
  db: Db,
  quoteId: string,
  opts?: { createdByUserId?: string; scheduledAt?: string }
): { db: Db; order: Order } {
  const quote = db.quotes.find((q) => q.id === quoteId);
  if (!quote) throw new Error("Quote not found");
  if (quote.status !== "approved") throw new Error("Only approved quotes can become orders");

  const existing = db.orders.find((o) => o.quoteId === quoteId);
  if (existing) throw new Error("An order already exists for this quote");

  const counter = (db.meta.orderCounter ?? 0) + 1;
  const orderId = generateId();
  const lines = quote.routes.map((route, i) => snapshotLine(db, orderId, route, i));
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
    history: [{ id: generateId(), type: "created", at: now, userId: opts?.createdByUserId }],
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

export function updateOrderStatus(db: Db, orderId: string, status: OrderStatus): Db {
  return {
    ...db,
    orders: db.orders.map((o) => (o.id === orderId ? { ...o, status: normalizeOrderStatus(status) } : o)),
  };
}

export function deriveOrderStatus(db: Db, orderId: string): OrderStatus {
  const order = getOrder(db, orderId);
  if (!order) return "pending";
  if (order.status === "cancelled" || order.status === "invoiced" || order.status === "completed") {
    return order.status;
  }

  const dispatches = db.dispatches.filter((d) => d.orderId === orderId);
  const tickets = db.deliveryTickets.filter((t) => t.orderId === orderId);

  if (dispatches.length === 0) return "pending";
  if (tickets.some((t) => t.status === "approved")) {
    const allDelivered = dispatches.every((d) => d.status === "delivered");
    return allDelivered ? "completed" : "active";
  }
  if (dispatches.some((d) => d.status !== "assigned")) return "active";
  return "active";
}

export function refreshOrderStatus(db: Db, orderId: string): Db {
  const order = getOrder(db, orderId);
  if (!order || order.status === "cancelled") return db;
  const status = deriveOrderStatus(db, orderId);
  return updateOrderStatus(db, orderId, status);
}

export function markOrderInvoiced(db: Db, orderId: string): Db {
  return updateOrderStatus(db, orderId, "invoiced");
}

export function completeOrder(db: Db, orderId: string, userId?: string): Db {
  const order = getOrder(db, orderId);
  if (!order) return db;
  const now = new Date().toISOString();
  return {
    ...db,
    orders: db.orders.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: "completed",
            history: appendHistory(o, { type: "completed", at: now, userId }),
          }
        : o
    ),
  };
}

export function cancelOrder(db: Db, orderId: string, userId?: string): Db {
  const order = getOrder(db, orderId);
  if (!order) return db;
  const now = new Date().toISOString();
  return {
    ...db,
    orders: db.orders.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: "cancelled",
            history: appendHistory(o, { type: "cancelled", at: now, userId }),
          }
        : o
    ),
  };
}

export function orderTotalQuoted(order: Order): number {
  return order.lines.reduce(
    (sum, l) => sum + l.haulSellRate * l.haulQtyQuoted + l.materialSellRate * l.materialQtyQuoted,
    0
  );
}

export function addOrderHistory(
  db: Db,
  orderId: string,
  event: Omit<OrderHistoryEvent, "id">
): Db {
  return {
    ...db,
    orders: db.orders.map((o) =>
      o.id === orderId ? { ...o, history: appendHistory(o, event) } : o
    ),
  };
}
