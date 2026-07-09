import {
  CustomerInvoice,
  CustomerInvoiceLine,
  Db,
  DeliveryTicket,
  OrderLine,
} from "./types";
import { generateId } from "./utils";
import { generateInvoiceNumber } from "./storage";
import { getOrder, markOrderInvoiced } from "./orders";
import { approvedTicketsForOrder } from "./delivery-tickets";
import { normalizeMaterialUnit, unitRateLabel } from "./types";

function findOrderLine(db: Db, orderLineId: string): OrderLine | undefined {
  for (const order of db.orders) {
    const line = order.lines.find((l) => l.id === orderLineId);
    if (line) return line;
  }
  return undefined;
}

function ticketDescription(ticket: DeliveryTicket, line: OrderLine): string {
  const route = [line.pickupAddress, line.dropoffAddress].filter(Boolean).join(" → ");
  if (ticket.lineType === "haul") {
    return `Hauling${route ? ` — ${route}` : ""}`;
  }
  if (ticket.lineType === "disposal") {
    return `Disposal${route ? ` — ${route}` : ""}`;
  }
  let matName = line.materialName || "Material";
  if (ticket.materialLineId && line.materialLines) {
    const mat = line.materialLines.find((m) => m.id === ticket.materialLineId);
    if (mat?.materialName) matName = mat.materialName;
  }
  return `${matName}${route ? ` (${route})` : ""}`;
}

function sellRateForTicket(line: OrderLine, ticket: DeliveryTicket): number {
  if (ticket.lineType === "haul") return line.haulSellRate;
  if (ticket.lineType === "disposal") return line.disposalSellRate ?? 0;
  if (ticket.materialLineId && line.materialLines) {
    const mat = line.materialLines.find((m) => m.id === ticket.materialLineId);
    if (mat) return mat.materialRate;
  }
  return line.materialSellRate;
}

function isTicketTaxable(line: OrderLine, ticket: DeliveryTicket): boolean {
  return ticket.lineType === "material" && line.taxable;
}

export function buildInvoiceLine(
  db: Db,
  ticket: DeliveryTicket
): CustomerInvoiceLine | null {
  const line = findOrderLine(db, ticket.orderLineId);
  if (!line) return null;
  const sellRate = sellRateForTicket(line, ticket);
  const amount = Math.round(sellRate * ticket.qty * 100) / 100;
  return {
    id: generateId(),
    description: ticketDescription(ticket, line),
    qty: ticket.qty,
    unit: normalizeMaterialUnit(ticket.unit),
    sellRate,
    amount,
    taxable: isTicketTaxable(line, ticket),
    orderLineId: line.id,
    deliveryTicketId: ticket.id,
  };
}

export function buildCustomerInvoiceFromTickets(
  db: Db,
  orderId: string,
  ticketIds: string[]
): { db: Db; invoice: CustomerInvoice } {
  const order = getOrder(db, orderId);
  if (!order) throw new Error("Order not found");

  const tickets = ticketIds
    .map((id) => db.deliveryTickets.find((t) => t.id === id))
    .filter((t): t is DeliveryTicket => Boolean(t));

  if (tickets.length === 0) throw new Error("No tickets selected");
  if (tickets.some((t) => t.orderId !== orderId)) {
    throw new Error("All tickets must belong to this order");
  }
  if (tickets.some((t) => t.status !== "approved")) {
    throw new Error("Only approved tickets can be invoiced");
  }

  const lines: CustomerInvoiceLine[] = [];
  for (const ticket of tickets) {
    const line = buildInvoiceLine(db, ticket);
    if (line) lines.push(line);
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const taxableSubtotal = lines
    .filter((l) => l.taxable)
    .reduce((sum, l) => sum + l.amount, 0);
  const tax = Math.round(taxableSubtotal * (order.taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  const counter = (db.meta.invoiceCounter ?? 0) + 1;
  const issuedAt = new Date().toISOString();
  const due = new Date();
  due.setDate(due.getDate() + 30);

  const invoice: CustomerInvoice = {
    id: generateId(),
    number: generateInvoiceNumber(counter),
    orderId: order.id,
    projectId: order.projectId,
    contractorId: order.contractorId,
    status: "draft",
    subtotal,
    tax,
    total,
    issuedAt,
    dueDate: due.toISOString().slice(0, 10),
    lines,
  };

  let nextDb: Db = {
    ...db,
    customerInvoices: [invoice, ...db.customerInvoices],
    meta: { ...db.meta, invoiceCounter: counter },
  };

  const allApproved = approvedTicketsForOrder(nextDb, orderId);
  const invoicedTicketIds = new Set(
    nextDb.customerInvoices.flatMap((inv) => inv.lines.map((l) => l.deliveryTicketId)).filter(Boolean)
  );
  if (allApproved.every((t) => invoicedTicketIds.has(t.id))) {
    nextDb = markOrderInvoiced(nextDb, orderId);
  }

  return { db: nextDb, invoice };
}

export function updateInvoiceStatus(
  db: Db,
  invoiceId: string,
  status: CustomerInvoice["status"]
): Db {
  return {
    ...db,
    customerInvoices: db.customerInvoices.map((inv) =>
      inv.id === invoiceId ? { ...inv, status } : inv
    ),
  };
}

export function invoicesForOffice(db: Db, officeId?: string): CustomerInvoice[] {
  if (!officeId) return db.customerInvoices;
  return db.customerInvoices.filter((inv) => {
    if (!inv.orderId) return true;
    const order = getOrder(db, inv.orderId);
    return !order?.officeId || order.officeId === officeId;
  });
}

export function formatInvoiceLineUnit(line: CustomerInvoiceLine): string {
  return unitRateLabel(line.unit);
}

function recalcInvoice(invoice: CustomerInvoice, taxRate: number): CustomerInvoice {
  const subtotal = invoice.lines.reduce((sum, l) => sum + l.amount, 0);
  const taxableSubtotal = invoice.lines
    .filter((l) => l.taxable)
    .reduce((sum, l) => sum + l.amount, 0);
  const tax = Math.round(taxableSubtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { ...invoice, subtotal, tax, total };
}

export function ticketAlreadyInvoiced(db: Db, ticketId: string): boolean {
  return db.customerInvoices.some((inv) =>
    inv.lines.some((l) => l.deliveryTicketId === ticketId)
  );
}

export function draftInvoiceForOrder(db: Db, orderId: string): CustomerInvoice | undefined {
  return db.customerInvoices.find((inv) => inv.orderId === orderId && inv.status === "draft");
}

export function appendTicketToDraftInvoice(
  db: Db,
  ticket: DeliveryTicket
): { db: Db; invoice: CustomerInvoice } {
  if (ticket.status !== "approved") throw new Error("Ticket must be approved");
  if (ticketAlreadyInvoiced(db, ticket.id)) {
    const existing = db.customerInvoices.find((inv) =>
      inv.lines.some((l) => l.deliveryTicketId === ticket.id)
    );
    if (existing) return { db, invoice: existing };
  }

  const order = getOrder(db, ticket.orderId);
  if (!order) throw new Error("Order not found");

  const line = buildInvoiceLine(db, ticket);
  if (!line) throw new Error("Could not build invoice line");

  const draft = draftInvoiceForOrder(db, order.id);
  if (draft) {
    const updated = recalcInvoice(
      { ...draft, lines: [...draft.lines, line] },
      order.taxRate
    );
    const nextDb: Db = {
      ...db,
      customerInvoices: db.customerInvoices.map((inv) =>
        inv.id === draft.id ? updated : inv
      ),
    };
    return { db: nextDb, invoice: updated };
  }

  const counter = (db.meta.invoiceCounter ?? 0) + 1;
  const issuedAt = new Date().toISOString();
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const invoice: CustomerInvoice = recalcInvoice(
    {
      id: generateId(),
      number: generateInvoiceNumber(counter),
      orderId: order.id,
      projectId: order.projectId,
      contractorId: order.contractorId,
      status: "draft",
      subtotal: 0,
      tax: 0,
      total: 0,
      issuedAt,
      dueDate: due.toISOString().slice(0, 10),
      lines: [line],
    },
    order.taxRate
  );

  let nextDb: Db = {
    ...db,
    customerInvoices: [invoice, ...db.customerInvoices],
    meta: { ...db.meta, invoiceCounter: counter },
  };

  const allApproved = approvedTicketsForOrder(nextDb, order.id);
  const invoicedTicketIds = new Set(
    nextDb.customerInvoices.flatMap((inv) => inv.lines.map((l) => l.deliveryTicketId)).filter(Boolean)
  );
  if (allApproved.every((t) => invoicedTicketIds.has(t.id))) {
    nextDb = markOrderInvoiced(nextDb, order.id);
  }

  return { db: nextDb, invoice };
}
