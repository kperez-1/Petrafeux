import {
  Db,
  DeliveryTicket,
  DeliveryTicketLineType,
  DeliveryTicketStatus,
  MaterialPriceUnit,
} from "./types";
import { generateId } from "./utils";
import { generateTicketNumber } from "./storage";
import { refreshOrderStatus } from "./orders";
import { tripForDispatch } from "./trips";

export interface RecordTicketInput {
  dispatchId: string;
  lineType: DeliveryTicketLineType;
  qty: number;
  unit?: MaterialPriceUnit;
  ticketNumber?: string;
  paperTicketNumber?: string;
  deliveredAt?: string;
  ticketImageUrl?: string;
  materialLineId?: string;
  driverSellRate?: number;
  notes?: string;
}

export interface UpdateTicketInput {
  qty?: number;
  paperTicketNumber?: string;
  ticketNumber?: string;
  notes?: string;
  ticketImageUrl?: string;
}

function assignTicketNumber(db: Db, ticket: DeliveryTicket): { db: Db; ticket: DeliveryTicket } {
  if (ticket.number) return { db, ticket };
  const counter = (db.meta.ticketCounter ?? 0) + 1;
  return {
    db: { ...db, meta: { ...db.meta, ticketCounter: counter } },
    ticket: { ...ticket, number: generateTicketNumber(counter) },
  };
}

export function recordDeliveryTicket(db: Db, input: RecordTicketInput): { db: Db; ticket: DeliveryTicket } {
  const dispatch = db.dispatches.find((d) => d.id === input.dispatchId);
  if (!dispatch) throw new Error("Dispatch not found");

  const orderLine = db.orders
    .flatMap((o) => o.lines)
    .find((l) => l.id === dispatch.orderLineId);
  if (!orderLine) throw new Error("Order line not found");

  const trip = tripForDispatch(db, dispatch.id);

  const unit =
    input.unit ??
    (input.lineType === "haul"
      ? orderLine.haulUnit ?? "TN"
      : input.lineType === "disposal"
        ? orderLine.materialUnit ?? "TN"
        : orderLine.materialUnit ?? "TN");

  let ticket: DeliveryTicket = {
    id: generateId(),
    dispatchId: dispatch.id,
    orderId: dispatch.orderId,
    orderLineId: dispatch.orderLineId,
    tripId: trip?.id ?? dispatch.tripId,
    lineType: input.lineType,
    materialLineId: input.materialLineId,
    ticketNumber: input.ticketNumber,
    paperTicketNumber: input.paperTicketNumber ?? input.ticketNumber,
    qty: input.qty,
    unit,
    deliveredAt: input.deliveredAt ?? new Date().toISOString(),
    status: "pending_review",
    ticketImageUrl: input.ticketImageUrl,
    driverSellRate: input.driverSellRate,
    notes: input.notes,
  };

  const numbered = assignTicketNumber(db, ticket);
  ticket = numbered.ticket;

  const next = {
    ...numbered.db,
    deliveryTickets: [ticket, ...numbered.db.deliveryTickets],
    dispatches: numbered.db.dispatches.map((d) =>
      d.id === dispatch.id ? { ...d, status: "delivered" as const } : d
    ),
  };
  return { db: refreshOrderStatus(next, dispatch.orderId), ticket };
}

export function updateDeliveryTicket(db: Db, ticketId: string, input: UpdateTicketInput): Db {
  return {
    ...db,
    deliveryTickets: db.deliveryTickets.map((t) =>
      t.id === ticketId
        ? {
            ...t,
            qty: input.qty ?? t.qty,
            paperTicketNumber: input.paperTicketNumber ?? t.paperTicketNumber,
            ticketNumber: input.ticketNumber ?? t.ticketNumber ?? t.paperTicketNumber,
            notes: input.notes ?? t.notes,
            ticketImageUrl: input.ticketImageUrl ?? t.ticketImageUrl,
          }
        : t
    ),
  };
}

export function getTicket(db: Db, ticketId: string): DeliveryTicket | undefined {
  return db.deliveryTickets.find((t) => t.id === ticketId);
}

export function updateTicketStatus(
  db: Db,
  ticketId: string,
  status: DeliveryTicketStatus,
  opts?: { approvedByUserId?: string }
): Db {
  const ticket = db.deliveryTickets.find((t) => t.id === ticketId);
  if (!ticket) throw new Error("Ticket not found");

  const now = new Date().toISOString();
  const next = {
    ...db,
    deliveryTickets: db.deliveryTickets.map((t) =>
      t.id === ticketId
        ? {
            ...t,
            status,
            approvedByUserId: status === "approved" ? opts?.approvedByUserId : t.approvedByUserId,
            rejectedAt: status === "rejected" ? now : t.rejectedAt,
          }
        : t
    ),
  };
  return refreshOrderStatus(next, ticket.orderId);
}

export function ticketsForOrder(db: Db, orderId: string): DeliveryTicket[] {
  return db.deliveryTickets.filter((t) => t.orderId === orderId);
}

export function pendingTicketsForOrder(db: Db, orderId: string): DeliveryTicket[] {
  return ticketsForOrder(db, orderId).filter((t) => t.status === "pending_review");
}

export function approvedTicketsForOrder(db: Db, orderId: string): DeliveryTicket[] {
  return ticketsForOrder(db, orderId).filter((t) => t.status === "approved");
}

export function ticketsForDispatch(db: Db, dispatchId: string): DeliveryTicket[] {
  return db.deliveryTickets.filter((t) => t.dispatchId === dispatchId);
}

export function pendingTickets(db: Db, officeId?: string): DeliveryTicket[] {
  return db.deliveryTickets.filter((t) => {
    if (t.status !== "pending_review") return false;
    const order = db.orders.find((o) => o.id === t.orderId);
    if (officeId && order?.officeId && order.officeId !== officeId) return false;
    return true;
  });
}

export function ordersWithPendingTickets(db: Db, officeId?: string) {
  const orderIds = new Set(pendingTickets(db, officeId).map((t) => t.orderId));
  return db.orders.filter((o) => orderIds.has(o.id));
}

export function ticketsGroupedByTrip(db: Db, orderId: string) {
  const tickets = pendingTicketsForOrder(db, orderId);
  const groups = new Map<string, DeliveryTicket[]>();
  for (const ticket of tickets) {
    const key = ticket.tripId ?? ticket.dispatchId;
    const list = groups.get(key) ?? [];
    list.push(ticket);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, tickets: list }));
}
