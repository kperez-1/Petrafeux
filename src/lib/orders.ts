import {
  Db,
  Order,
  OrderHistoryEvent,
  OrderStatus,
} from "./types";
import { generateId } from "./utils";
import { normalizeOrderStatus } from "./order-status";

export {
  createOrderFromQuote,
  createOrderFromSelections,
  orderedQtyForRouteMaterial,
  selectionsSubtotal,
  selectionsTotalWithTax,
  routeDisplayLabel,
  wizardItemsForRoutes,
  type CreateOrderWizardItem,
  type OrderLineSelection,
} from "./create-order-wizard";

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
