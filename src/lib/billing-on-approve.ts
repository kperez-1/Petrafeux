import { CarrierSettlement, CustomerInvoice, Db, OrderLine, VendorSettlement } from "./types";
import {
  getTicket,
  updateDeliveryTicket,
  updateTicketStatus,
  UpdateTicketInput,
} from "./delivery-tickets";
import {
  appendTicketToDraftInvoice,
  invoiceChargeExists,
} from "./billing-ar";
import {
  appendTicketToDraftCarrierSettlement,
  ticketAlreadyInCarrierSettlement,
} from "./billing-ap";
import {
  appendTicketToDraftVendorSettlement,
  vendorTicketChargeExists,
} from "./billing-ap-vendor";
import { addOrderHistory } from "./orders";
import {
  isDeliveryTicket,
  shouldBillDisposalOnDelivery,
  shouldBillMaterialOnDelivery,
  withTicketLineType,
} from "./delivery-ticket-billing";

export interface ApproveTicketResult {
  db: Db;
  ticketId: string;
  invoice?: CustomerInvoice;
  carrierSettlement?: CarrierSettlement;
  vendorSettlement?: VendorSettlement;
}

function findOrderLine(db: Db, orderLineId: string): OrderLine | undefined {
  for (const order of db.orders) {
    const line = order.lines.find((l) => l.id === orderLineId);
    if (line) return line;
  }
  return undefined;
}

function billDeliveryTicket(db: Db, ticketId: string): ApproveTicketResult {
  const ticket = getTicket(db, ticketId);
  if (!ticket || ticket.status !== "approved" || !isDeliveryTicket(ticket)) {
    throw new Error("Ticket must be an approved delivery ticket");
  }

  const orderLine = findOrderLine(db, ticket.orderLineId);
  if (!orderLine) throw new Error("Order line not found");

  let nextDb = db;
  let invoice: CustomerInvoice | undefined;
  let carrierSettlement: CarrierSettlement | undefined;
  let vendorSettlement: VendorSettlement | undefined;

  const haulTicket = withTicketLineType(ticket, "haul");
  if (!invoiceChargeExists(nextDb, ticket.id, "haul")) {
    const invResult = appendTicketToDraftInvoice(nextDb, haulTicket);
    nextDb = invResult.db;
    invoice = invResult.invoice;
  }

  if (shouldBillMaterialOnDelivery(orderLine) && !invoiceChargeExists(nextDb, ticket.id, "material")) {
    const invResult = appendTicketToDraftInvoice(
      nextDb,
      withTicketLineType(ticket, "material")
    );
    nextDb = invResult.db;
    invoice = invResult.invoice;
  }

  if (shouldBillDisposalOnDelivery(orderLine) && !invoiceChargeExists(nextDb, ticket.id, "disposal")) {
    const invResult = appendTicketToDraftInvoice(
      nextDb,
      withTicketLineType(ticket, "disposal")
    );
    nextDb = invResult.db;
    invoice = invResult.invoice;
  }

  if (!ticketAlreadyInCarrierSettlement(nextDb, ticket.id)) {
    const carResult = appendTicketToDraftCarrierSettlement(nextDb, haulTicket);
    nextDb = carResult.db;
    carrierSettlement = carResult.settlement;
  }

  if (shouldBillMaterialOnDelivery(orderLine) && !vendorTicketChargeExists(nextDb, ticket.id, "material")) {
    const venResult = appendTicketToDraftVendorSettlement(
      nextDb,
      withTicketLineType(ticket, "material")
    );
    nextDb = venResult.db;
    vendorSettlement = venResult.settlement;
  }

  if (shouldBillDisposalOnDelivery(orderLine) && !vendorTicketChargeExists(nextDb, ticket.id, "disposal")) {
    const venResult = appendTicketToDraftVendorSettlement(
      nextDb,
      withTicketLineType(ticket, "disposal")
    );
    nextDb = venResult.db;
    vendorSettlement = venResult.settlement;
  }

  return { db: nextDb, ticketId, invoice, carrierSettlement, vendorSettlement };
}

export function createBillingForApprovedTicket(
  db: Db,
  ticketId: string
): ApproveTicketResult {
  const ticket = getTicket(db, ticketId);
  if (!ticket || ticket.status !== "approved") {
    throw new Error("Ticket must be approved");
  }

  if (isDeliveryTicket(ticket)) {
    return billDeliveryTicket(db, ticketId);
  }

  let nextDb = db;
  let invoice: CustomerInvoice | undefined;
  let carrierSettlement: CarrierSettlement | undefined;
  let vendorSettlement: VendorSettlement | undefined;

  if (!invoiceChargeExists(nextDb, ticketId, ticket.lineType)) {
    const invResult = appendTicketToDraftInvoice(nextDb, ticket);
    nextDb = invResult.db;
    invoice = invResult.invoice;
  }

  if (ticket.lineType === "haul" && !ticketAlreadyInCarrierSettlement(nextDb, ticketId)) {
    const carResult = appendTicketToDraftCarrierSettlement(nextDb, ticket);
    nextDb = carResult.db;
    carrierSettlement = carResult.settlement;
  }

  if (
    (ticket.lineType === "material" || ticket.lineType === "disposal") &&
    !vendorTicketChargeExists(nextDb, ticketId, ticket.lineType === "disposal" ? "disposal" : "material")
  ) {
    const venResult = appendTicketToDraftVendorSettlement(nextDb, ticket);
    nextDb = venResult.db;
    vendorSettlement = venResult.settlement;
  }

  return { db: nextDb, ticketId, invoice, carrierSettlement, vendorSettlement };
}

export function saveAndApproveTicket(
  db: Db,
  ticketId: string,
  updates: UpdateTicketInput,
  approvedByUserId?: string
): ApproveTicketResult {
  let nextDb = updateDeliveryTicket(db, ticketId, updates);
  nextDb = updateTicketStatus(nextDb, ticketId, "approved", { approvedByUserId });

  const ticket = getTicket(nextDb, ticketId);
  if (ticket) {
    nextDb = addOrderHistory(nextDb, ticket.orderId, {
      type: "ticket_approved",
      at: new Date().toISOString(),
      userId: approvedByUserId,
      note: ticket.number ?? ticket.paperTicketNumber,
    });
  }

  return createBillingForApprovedTicket(nextDb, ticketId);
}

export function rejectTicket(db: Db, ticketId: string): Db {
  return updateTicketStatus(db, ticketId, "rejected");
}

export function saveTicket(db: Db, ticketId: string, updates: UpdateTicketInput): Db {
  return updateDeliveryTicket(db, ticketId, updates);
}
