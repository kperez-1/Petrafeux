import { CarrierSettlement, CustomerInvoice, Db, VendorSettlement } from "./types";
import {
  getTicket,
  updateDeliveryTicket,
  updateTicketStatus,
  UpdateTicketInput,
} from "./delivery-tickets";
import { appendTicketToDraftInvoice, ticketAlreadyInvoiced } from "./billing-ar";
import {
  appendTicketToDraftCarrierSettlement,
  ticketAlreadyInCarrierSettlement,
} from "./billing-ap";
import {
  appendTicketToDraftVendorSettlement,
  ticketAlreadyInVendorSettlement,
} from "./billing-ap-vendor";
import { addOrderHistory } from "./orders";

export interface ApproveTicketResult {
  db: Db;
  ticketId: string;
  invoice?: CustomerInvoice;
  carrierSettlement?: CarrierSettlement;
  vendorSettlement?: VendorSettlement;
}

export function createBillingForApprovedTicket(
  db: Db,
  ticketId: string
): ApproveTicketResult {
  const ticket = getTicket(db, ticketId);
  if (!ticket || ticket.status !== "approved") {
    throw new Error("Ticket must be approved");
  }

  let nextDb = db;
  let invoice: CustomerInvoice | undefined;
  let carrierSettlement: CarrierSettlement | undefined;
  let vendorSettlement: VendorSettlement | undefined;

  if (!ticketAlreadyInvoiced(nextDb, ticketId)) {
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
    !ticketAlreadyInVendorSettlement(nextDb, ticketId)
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
