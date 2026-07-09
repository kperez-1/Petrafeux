import {
  Db,
  DeliveryTicket,
  OrderLine,
  VendorSettlement,
  VendorSettlementLine,
  VendorSettlementPayeeKind,
} from "./types";
import { generateId } from "./utils";
import { generateVendorSettlementNumber } from "./storage";
import { getOrder } from "./orders";
import {
  buyRateForVendorTicket,
  getVendor,
  payeeKindForTicket,
  vendorIdForTicket,
  vendorPayeeLabel,
} from "./vendor-payables";
import { normalizeMaterialUnit } from "./types";
import { assertCanMarkVendorPaid } from "./billing-disputes";

function findOrderLine(db: Db, orderLineId: string): OrderLine | undefined {
  for (const order of db.orders) {
    const line = order.lines.find((l) => l.id === orderLineId);
    if (line) return line;
  }
  return undefined;
}

function ticketDescription(
  db: Db,
  ticket: DeliveryTicket,
  line: OrderLine,
  kind: VendorSettlementPayeeKind
): string {
  const route = [line.pickupAddress, line.dropoffAddress].filter(Boolean).join(" → ");
  if (kind === "disposal") {
    const vendor = line.dropoffVendorId ? getVendor(db, line.dropoffVendorId) : undefined;
    const site = vendor?.name || line.dropoffAddress || "Disposal";
    return `Disposal fee — ${site}${route ? ` (${route})` : ""}`;
  }
  let matName = line.materialName || "Material";
  if (ticket.materialLineId && line.materialLines) {
    const mat = line.materialLines.find((m) => m.id === ticket.materialLineId);
    if (mat?.materialName) matName = mat.materialName;
  }
  const vendor = line.pickupVendorId ? getVendor(db, line.pickupVendorId) : undefined;
  const prefix = vendor ? `${vendor.name}: ` : "";
  return `${prefix}${matName}${route ? ` (${route})` : ""}`;
}

export function buildVendorSettlementLine(
  db: Db,
  ticket: DeliveryTicket
): VendorSettlementLine | null {
  const line = findOrderLine(db, ticket.orderLineId);
  if (!line) return null;
  if (ticket.lineType === "haul") return null;

  const buyRate = buyRateForVendorTicket(line, ticket);
  if (buyRate <= 0) return null;

  const kind = payeeKindForTicket(ticket);
  const amount = Math.round(buyRate * ticket.qty * 100) / 100;

  return {
    id: generateId(),
    description: ticketDescription(db, ticket, line, kind),
    qty: ticket.qty,
    unit: normalizeMaterialUnit(ticket.unit),
    buyRate,
    amount,
    orderLineId: line.id,
    deliveryTicketId: ticket.id,
  };
}

export function buildVendorSettlementFromTickets(
  db: Db,
  orderId: string,
  vendorId: string,
  payeeKind: VendorSettlementPayeeKind,
  ticketIds: string[]
): { db: Db; settlement: VendorSettlement } {
  const order = getOrder(db, orderId);
  if (!order) throw new Error("Order not found");
  if (!getVendor(db, vendorId)) throw new Error("Vendor not found");

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
  if (tickets.some((t) => t.lineType === "haul")) {
    throw new Error("Haul tickets belong on carrier settlements, not vendor payables");
  }

  for (const ticket of tickets) {
    const kind = payeeKindForTicket(ticket);
    if (kind !== payeeKind) {
      throw new Error(`Ticket ${ticket.id} is ${kind}, expected ${payeeKind}`);
    }
    const line = findOrderLine(db, ticket.orderLineId);
    if (!line) throw new Error("Order line not found");
    const owedVendor = vendorIdForTicket(db, line, ticket);
    if (owedVendor !== vendorId) {
      throw new Error("All tickets must belong to the selected vendor");
    }
  }

  const lines: VendorSettlementLine[] = [];
  for (const ticket of tickets) {
    const line = buildVendorSettlementLine(db, ticket);
    if (line) lines.push(line);
  }
  if (lines.length === 0) throw new Error("No payable lines from selected tickets");

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const counter = (db.meta.vendorSettlementCounter ?? 0) + 1;
  const settlement: VendorSettlement = {
    id: generateId(),
    number: generateVendorSettlementNumber(counter),
    orderId: order.id,
    vendorId,
    payeeKind,
    status: "draft",
    subtotal,
    netPay: subtotal,
    issuedAt: new Date().toISOString(),
    lines,
  };

  return {
    db: {
      ...db,
      vendorSettlements: [settlement, ...db.vendorSettlements],
      meta: { ...db.meta, vendorSettlementCounter: counter },
    },
    settlement,
  };
}

export function updateVendorSettlementStatus(
  db: Db,
  settlementId: string,
  status: VendorSettlement["status"]
): Db {
  if (status === "paid") {
    const settlement = db.vendorSettlements.find((s) => s.id === settlementId);
    if (settlement) assertCanMarkVendorPaid(settlement);
  }
  return {
    ...db,
    vendorSettlements: db.vendorSettlements.map((s) =>
      s.id === settlementId ? { ...s, status } : s
    ),
  };
}

export function vendorSettlementsForOffice(db: Db, officeId?: string): VendorSettlement[] {
  if (!officeId) return db.vendorSettlements;
  return db.vendorSettlements.filter((s) => {
    if (!s.orderId) return true;
    const order = getOrder(db, s.orderId);
    return !order?.officeId || order.officeId === officeId;
  });
}

export function unsettledVendorTickets(
  db: Db,
  orderId: string,
  vendorId: string,
  payeeKind: VendorSettlementPayeeKind
) {
  const settledIds = new Set(
    db.vendorSettlements
      .flatMap((s) => s.lines.map((l) => l.deliveryTicketId))
      .filter(Boolean)
  );
  return db.deliveryTickets.filter((t) => {
    if (t.orderId !== orderId || t.status !== "approved" || t.lineType === "haul") return false;
    if (settledIds.has(t.id)) return false;
    if (payeeKindForTicket(t) !== payeeKind) return false;
    const line = findOrderLine(db, t.orderLineId);
    if (!line) return false;
    return vendorIdForTicket(db, line, t) === vendorId;
  });
}

export function vendorsWithUnsettledTickets(
  db: Db,
  orderId: string
): { vendorId: string; payeeKind: VendorSettlementPayeeKind; tickets: DeliveryTicket[] }[] {
  const approved = db.deliveryTickets.filter(
    (t) => t.orderId === orderId && t.status === "approved" && t.lineType !== "haul"
  );
  const settledIds = new Set(
    db.vendorSettlements
      .flatMap((s) => s.lines.map((l) => l.deliveryTicketId))
      .filter(Boolean)
  );
  const map = new Map<string, DeliveryTicket[]>();
  for (const ticket of approved) {
    if (settledIds.has(ticket.id)) continue;
    const line = findOrderLine(db, ticket.orderLineId);
    if (!line) continue;
    const vendorId = vendorIdForTicket(db, line, ticket);
    if (!vendorId) continue;
    const kind = payeeKindForTicket(ticket);
    const key = `${vendorId}:${kind}`;
    const list = map.get(key) ?? [];
    list.push(ticket);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, tickets]) => {
    const [vendorId, payeeKind] = key.split(":") as [string, VendorSettlementPayeeKind];
    return { vendorId, payeeKind, tickets };
  });
}

export function formatVendorSettlementTitle(
  db: Db,
  vendorId: string,
  payeeKind: VendorSettlementPayeeKind
): string {
  return vendorPayeeLabel(getVendor(db, vendorId), payeeKind);
}

function recalcVendorSettlement(settlement: VendorSettlement): VendorSettlement {
  const subtotal = settlement.lines.reduce((sum, l) => sum + l.amount, 0);
  return { ...settlement, subtotal, netPay: subtotal };
}

export function ticketAlreadyInVendorSettlement(db: Db, ticketId: string): boolean {
  return db.vendorSettlements.some((s) =>
    s.lines.some((l) => l.deliveryTicketId === ticketId)
  );
}

export function draftVendorSettlement(
  db: Db,
  orderId: string,
  vendorId: string,
  payeeKind: VendorSettlementPayeeKind
): VendorSettlement | undefined {
  return db.vendorSettlements.find(
    (s) =>
      s.orderId === orderId &&
      s.vendorId === vendorId &&
      s.payeeKind === payeeKind &&
      s.status === "draft"
  );
}

export function appendTicketToDraftVendorSettlement(
  db: Db,
  ticket: DeliveryTicket
): { db: Db; settlement?: VendorSettlement } {
  if (ticket.lineType === "haul" || ticket.status !== "approved") return { db };
  if (ticketAlreadyInVendorSettlement(db, ticket.id)) return { db };

  const line = findOrderLine(db, ticket.orderLineId);
  if (!line) return { db };

  const vendorId = vendorIdForTicket(db, line, ticket);
  if (!vendorId) return { db };

  const payeeKind = payeeKindForTicket(ticket);
  const settlementLine = buildVendorSettlementLine(db, ticket);
  if (!settlementLine) return { db };

  const draft = draftVendorSettlement(db, ticket.orderId, vendorId, payeeKind);
  if (draft) {
    const updated = recalcVendorSettlement({ ...draft, lines: [...draft.lines, settlementLine] });
    return {
      db: {
        ...db,
        vendorSettlements: db.vendorSettlements.map((s) =>
          s.id === draft.id ? updated : s
        ),
      },
      settlement: updated,
    };
  }

  const counter = (db.meta.vendorSettlementCounter ?? 0) + 1;
  const settlement = recalcVendorSettlement({
    id: generateId(),
    number: generateVendorSettlementNumber(counter),
    orderId: ticket.orderId,
    vendorId,
    payeeKind,
    status: "draft",
    subtotal: 0,
    netPay: 0,
    issuedAt: new Date().toISOString(),
    lines: [settlementLine],
  });

  return {
    db: {
      ...db,
      vendorSettlements: [settlement, ...db.vendorSettlements],
      meta: { ...db.meta, vendorSettlementCounter: counter },
    },
    settlement,
  };
}
