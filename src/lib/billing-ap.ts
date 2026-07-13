import {
  CarrierSettlement,
  CarrierSettlementLine,
  Db,
  DeliveryTicket,
  OrderLine,
} from "./types";
import { generateId } from "./utils";
import { generateSettlementNumber } from "./storage";
import { getOrder } from "./orders";
import { getBrokerFeePercent } from "./db-defaults";
import { netHaulBuyRate } from "./margin-calc";
import { normalizeMaterialUnit } from "./types";
import { actsAsHaulTicket } from "./delivery-ticket-billing";
import { resolveMaterialBuyRate } from "./route-materials";

function findOrderLine(db: Db, orderLineId: string): OrderLine | undefined {
  for (const order of db.orders) {
    const line = order.lines.find((l) => l.id === orderLineId);
    if (line) return line;
  }
  return undefined;
}

function buyRateForTicket(line: OrderLine, ticket: DeliveryTicket): number {
  if (actsAsHaulTicket(ticket)) return line.haulBuyRate;
  return resolveMaterialBuyRate(line, ticket.materialLineId);
}

function ticketDescription(ticket: DeliveryTicket, line: OrderLine): string {
  const route = [line.pickupAddress, line.dropoffAddress].filter(Boolean).join(" → ");
  if (actsAsHaulTicket(ticket)) {
    return `Haul pay${route ? ` — ${route}` : ""}`;
  }
  let matName = line.materialName || "Material buy";
  if (ticket.materialLineId && line.materialLines) {
    const mat = line.materialLines.find((m) => m.id === ticket.materialLineId);
    if (mat?.materialName) matName = mat.materialName;
  }
  return `${matName}${route ? ` (${route})` : ""}`;
}

export function buildSettlementLine(
  db: Db,
  ticket: DeliveryTicket,
  brokerFeePercent: number
): CarrierSettlementLine | null {
  const line = findOrderLine(db, ticket.orderLineId);
  if (!line) return null;

  const buyRate = buyRateForTicket(line, ticket);
  if (!actsAsHaulTicket(ticket)) return null;
  if (buyRate <= 0) return null;

  const grossAmount = Math.round(buyRate * ticket.qty * 100) / 100;
  const brokerFee =
    actsAsHaulTicket(ticket)
      ? Math.round(grossAmount * (brokerFeePercent / 100) * 100) / 100
      : 0;
  const netPay =
    actsAsHaulTicket(ticket)
      ? Math.round(netHaulBuyRate(buyRate, brokerFeePercent) * ticket.qty * 100) / 100
      : grossAmount;

  return {
    id: generateId(),
    description: ticketDescription(ticket, line),
    qty: ticket.qty,
    unit: normalizeMaterialUnit(ticket.unit),
    buyRate,
    grossAmount,
    brokerFee,
    netPay,
    orderLineId: line.id,
    deliveryTicketId: ticket.id,
  };
}

export function buildCarrierSettlementFromTickets(
  db: Db,
  orderId: string,
  carrierId: string,
  ticketIds: string[]
): { db: Db; settlement: CarrierSettlement } {
  const order = getOrder(db, orderId);
  if (!order) throw new Error("Order not found");
  if (!db.carriers.some((c) => c.id === carrierId)) throw new Error("Carrier not found");

  const brokerFeePercent = getBrokerFeePercent(db.meta);
  const tickets = ticketIds
    .map((id) => db.deliveryTickets.find((t) => t.id === id))
    .filter((t): t is DeliveryTicket => Boolean(t));

  if (tickets.length === 0) throw new Error("No tickets selected");
  if (tickets.some((t) => t.orderId !== orderId)) {
    throw new Error("All tickets must belong to this order");
  }
  if (tickets.some((t) => t.status !== "approved")) {
    throw new Error("Only approved tickets can be settled");
  }

  for (const ticket of tickets) {
    if (!actsAsHaulTicket(ticket)) {
      throw new Error("Carrier settlements only include haul tickets");
    }
    const dispatch = db.dispatches.find((d) => d.id === ticket.dispatchId);
    if (!dispatch || dispatch.carrierId !== carrierId) {
      throw new Error("All tickets must belong to dispatches for this carrier");
    }
  }

  const lines: CarrierSettlementLine[] = [];
  for (const ticket of tickets) {
    if (!actsAsHaulTicket(ticket)) continue;
    const line = buildSettlementLine(db, ticket, brokerFeePercent);
    if (line) lines.push(line);
  }
  if (lines.length === 0) throw new Error("No payable lines from selected tickets");

  const subtotal = lines.reduce((sum, l) => sum + l.grossAmount, 0);
  const brokerFee = lines.reduce((sum, l) => sum + l.brokerFee, 0);
  const netPay = lines.reduce((sum, l) => sum + l.netPay, 0);

  const counter = (db.meta.settlementCounter ?? 0) + 1;
  const settlement: CarrierSettlement = {
    id: generateId(),
    number: generateSettlementNumber(counter),
    orderId: order.id,
    carrierId,
    status: "draft",
    subtotal,
    brokerFee,
    netPay,
    issuedAt: new Date().toISOString(),
    lines,
  };

  return {
    db: {
      ...db,
      carrierSettlements: [settlement, ...db.carrierSettlements],
      meta: { ...db.meta, settlementCounter: counter },
    },
    settlement,
  };
}

export function updateSettlementStatus(
  db: Db,
  settlementId: string,
  status: CarrierSettlement["status"]
): Db {
  return {
    ...db,
    carrierSettlements: db.carrierSettlements.map((s) =>
      s.id === settlementId ? { ...s, status } : s
    ),
  };
}

export function settlementsForOffice(db: Db, officeId?: string): CarrierSettlement[] {
  if (!officeId) return db.carrierSettlements;
  return db.carrierSettlements.filter((s) => {
    const order = getOrder(db, s.orderId);
    return !order?.officeId || order.officeId === officeId;
  });
}

function recalcCarrierSettlement(settlement: CarrierSettlement): CarrierSettlement {
  const subtotal = settlement.lines.reduce((sum, l) => sum + l.grossAmount, 0);
  const brokerFee = settlement.lines.reduce((sum, l) => sum + l.brokerFee, 0);
  const netPay = settlement.lines.reduce((sum, l) => sum + l.netPay, 0);
  return { ...settlement, subtotal, brokerFee, netPay };
}

export function ticketAlreadyInCarrierSettlement(db: Db, ticketId: string): boolean {
  return db.carrierSettlements.some((s) =>
    s.lines.some((l) => l.deliveryTicketId === ticketId)
  );
}

export function draftCarrierSettlement(
  db: Db,
  orderId: string,
  carrierId: string
): CarrierSettlement | undefined {
  return db.carrierSettlements.find(
    (s) => s.orderId === orderId && s.carrierId === carrierId && s.status === "draft"
  );
}

export function appendTicketToDraftCarrierSettlement(
  db: Db,
  ticket: DeliveryTicket
): { db: Db; settlement?: CarrierSettlement } {
  if (ticket.status !== "approved" || !actsAsHaulTicket(ticket)) return { db };
  if (ticketAlreadyInCarrierSettlement(db, ticket.id)) return { db };

  const dispatch = db.dispatches.find((d) => d.id === ticket.dispatchId);
  if (!dispatch) return { db };

  const brokerFeePercent = getBrokerFeePercent(db.meta);
  const line = buildSettlementLine(db, ticket, brokerFeePercent);
  if (!line) return { db };

  const draft = draftCarrierSettlement(db, ticket.orderId, dispatch.carrierId);
  if (draft) {
    const updated = recalcCarrierSettlement({ ...draft, lines: [...draft.lines, line] });
    return {
      db: {
        ...db,
        carrierSettlements: db.carrierSettlements.map((s) =>
          s.id === draft.id ? updated : s
        ),
      },
      settlement: updated,
    };
  }

  const counter = (db.meta.settlementCounter ?? 0) + 1;
  const settlement = recalcCarrierSettlement({
    id: generateId(),
    number: generateSettlementNumber(counter),
    orderId: ticket.orderId,
    carrierId: dispatch.carrierId,
    status: "draft",
    subtotal: 0,
    brokerFee: 0,
    netPay: 0,
    issuedAt: new Date().toISOString(),
    lines: [line],
  });

  return {
    db: {
      ...db,
      carrierSettlements: [settlement, ...db.carrierSettlements],
      meta: { ...db.meta, settlementCounter: counter },
    },
    settlement,
  };
}
