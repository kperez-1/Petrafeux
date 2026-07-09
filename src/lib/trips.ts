import { Db, Trip, TripStatus } from "./types";
import { generateId } from "./utils";
import { generateTripNumber } from "./storage";

export function getTrip(db: Db, tripId: string): Trip | undefined {
  return db.trips.find((t) => t.id === tripId);
}

export function tripsForOrder(db: Db, orderId: string): Trip[] {
  return db.trips.filter((t) => t.orderId === orderId);
}

export function createTripForDispatch(
  db: Db,
  dispatchId: string,
  opts?: { truckLabel?: string; driverName?: string; scheduledDate?: string }
): { db: Db; trip: Trip } {
  const dispatch = db.dispatches.find((d) => d.id === dispatchId);
  if (!dispatch) throw new Error("Dispatch not found");

  const counter = (db.meta.tripCounter ?? 0) + 1;
  const trip: Trip = {
    id: generateId(),
    number: generateTripNumber(counter),
    orderId: dispatch.orderId,
    dispatchId: dispatch.id,
    carrierId: dispatch.carrierId,
    truckLabel: opts?.truckLabel ?? dispatch.truckLabel,
    driverName: opts?.driverName,
    status: "assigned",
    scheduledDate: opts?.scheduledDate ?? dispatch.scheduledDate,
    createdAt: new Date().toISOString(),
  };

  const nextDb: Db = {
    ...db,
    trips: [trip, ...db.trips],
    dispatches: db.dispatches.map((d) =>
      d.id === dispatchId ? { ...d, tripId: trip.id, truckLabel: trip.truckLabel, scheduledDate: trip.scheduledDate } : d
    ),
    meta: { ...db.meta, tripCounter: counter },
  };

  return { db: nextDb, trip };
}

export function updateTripStatus(db: Db, tripId: string, status: TripStatus): Db {
  return {
    ...db,
    trips: db.trips.map((t) => (t.id === tripId ? { ...t, status } : t)),
  };
}

export function tripForDispatch(db: Db, dispatchId: string): Trip | undefined {
  const dispatch = db.dispatches.find((d) => d.id === dispatchId);
  if (dispatch?.tripId) return getTrip(db, dispatch.tripId);
  return db.trips.find((t) => t.dispatchId === dispatchId);
}
