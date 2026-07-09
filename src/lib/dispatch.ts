import { Carrier, Db, Dispatch, DispatchStatus } from "./types";
import { generateId } from "./utils";
import { addOrderHistory, refreshOrderStatus } from "./orders";
import { createTripForDispatch } from "./trips";

export function getCarrier(db: Db, carrierId: string): Carrier | undefined {
  return db.carriers.find((c) => c.id === carrierId);
}

export function carriersForOffice(db: Db, officeId?: string): Carrier[] {
  if (!officeId) return db.carriers;
  return db.carriers.filter((c) => !c.officeId || c.officeId === officeId);
}

export function upsertCarrier(db: Db, carrier: Carrier): Db {
  const idx = db.carriers.findIndex((c) => c.id === carrier.id);
  if (idx >= 0) {
    const next = [...db.carriers];
    next[idx] = carrier;
    return { ...db, carriers: next };
  }
  return { ...db, carriers: [carrier, ...db.carriers] };
}

export function deleteCarrier(db: Db, carrierId: string): Db {
  return { ...db, carriers: db.carriers.filter((c) => c.id !== carrierId) };
}

export function assignDispatch(
  db: Db,
  orderId: string,
  orderLineId: string,
  carrierId: string,
  opts?: { notes?: string; truckLabel?: string; driverName?: string; scheduledDate?: string; userId?: string }
): { db: Db; dispatch: Dispatch } {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new Error("Order not found");
  if (!order.lines.some((l) => l.id === orderLineId)) throw new Error("Order line not found");
  if (!getCarrier(db, carrierId)) throw new Error("Carrier not found");

  const now = new Date().toISOString();
  const dispatch: Dispatch = {
    id: generateId(),
    orderId,
    orderLineId,
    carrierId,
    status: "assigned",
    assignedAt: now,
    notes: opts?.notes,
    truckLabel: opts?.truckLabel,
    scheduledDate: opts?.scheduledDate,
  };

  let next: Db = {
    ...db,
    dispatches: [dispatch, ...db.dispatches],
  };
  next = addOrderHistory(next, orderId, {
    type: "dispatched",
    at: now,
    userId: opts?.userId,
    note: opts?.truckLabel ? `Truck ${opts.truckLabel}` : undefined,
  });
  const tripResult = createTripForDispatch(next, dispatch.id, {
    truckLabel: opts?.truckLabel,
    driverName: opts?.driverName,
    scheduledDate: opts?.scheduledDate,
  });
  next = refreshOrderStatus(tripResult.db, orderId);
  const saved = next.dispatches.find((d) => d.id === dispatch.id)!;
  return { db: next, dispatch: saved };
}

export function updateDispatchStatus(
  db: Db,
  dispatchId: string,
  status: DispatchStatus
): Db {
  const dispatch = db.dispatches.find((d) => d.id === dispatchId);
  if (!dispatch) throw new Error("Dispatch not found");

  const next = {
    ...db,
    dispatches: db.dispatches.map((d) => (d.id === dispatchId ? { ...d, status } : d)),
  };
  return refreshOrderStatus(next, dispatch.orderId);
}

export function dispatchesForOrder(db: Db, orderId: string): Dispatch[] {
  return db.dispatches.filter((d) => d.orderId === orderId);
}

export function dispatchesForCarrier(db: Db, carrierId: string): Dispatch[] {
  return db.dispatches.filter((d) => d.carrierId === carrierId);
}

export function dispatchesForDate(db: Db, dateIso: string): Dispatch[] {
  const day = dateIso.slice(0, 10);
  return db.dispatches.filter((d) => (d.scheduledDate ?? d.assignedAt).slice(0, 10) === day);
}

export function activeOrdersForDispatch(db: Db, officeId?: string, dateIso?: string) {
  const day = dateIso?.slice(0, 10);
  return db.orders.filter((o) => {
    if (o.status === "cancelled" || o.status === "completed" || o.status === "invoiced") return false;
    if (officeId && o.officeId && o.officeId !== officeId) return false;
    if (day && o.scheduledAt && !o.scheduledAt.startsWith(day)) return false;
    return true;
  });
}
