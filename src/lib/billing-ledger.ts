import {
  CarrierSettlement,
  CarrierSettlementStatus,
  CustomerInvoice,
  CustomerInvoiceLine,
  CustomerInvoiceStatus,
  Db,
  DeliveryTicket,
  VendorSettlement,
  VendorSettlementStatus,
  AgingBucket,
} from "./types";
import { getContactsForCompany } from "./contractors";
import { invoicesForOffice } from "./billing-ar";
import { settlementsForOffice } from "./billing-ap";
import { formatVendorSettlementTitle, vendorSettlementsForOffice } from "./billing-ap-vendor";
import { getCarrier } from "./dispatch";
import { getVendor } from "./vendor-payables";
import { agingBucketApOpen, agingBucketAr, isOverdueApOpen, isOverdueAr } from "./billing-aging";

export type LedgerBucket = "open" | "paid" | "all";

export interface BalanceSummary {
  openCount: number;
  openTotal: number;
  paidCount: number;
  paidTotal: number;
}

export type ApRowKind = "carrier" | "vendor";

export interface ApLedgerRow {
  id: string;
  number: string;
  kind: ApRowKind;
  partyId: string;
  partyName: string;
  payeeKind?: "material" | "disposal";
  orderId?: string;
  amount: number;
  status: CarrierSettlementStatus | VendorSettlementStatus;
  issuedAt: string;
  dueDate?: string;
  vendorInvoiceNumber?: string;
  source?: "ticket" | "manual";
}

export function isOpenAr(status: CustomerInvoiceStatus): boolean {
  return status === "draft" || status === "sent";
}

export function isPaidAr(status: CustomerInvoiceStatus): boolean {
  return status === "paid";
}

export function isOpenAp(status: CarrierSettlementStatus | VendorSettlementStatus): boolean {
  return status === "draft" || status === "approved" || status === "disputed";
}

export function isDisputedVendorSettlement(status: VendorSettlementStatus): boolean {
  return status === "disputed";
}

export function isPaidAp(status: CarrierSettlementStatus | VendorSettlementStatus): boolean {
  return status === "paid";
}

export function matchesBucketAr(
  status: CustomerInvoiceStatus,
  bucket: LedgerBucket
): boolean {
  if (bucket === "all") return status !== "void";
  if (bucket === "open") return isOpenAr(status);
  return isPaidAr(status);
}

export function matchesBucketAp(
  status: CarrierSettlementStatus | VendorSettlementStatus,
  bucket: LedgerBucket
): boolean {
  if (bucket === "all") return true;
  if (bucket === "open") return isOpenAp(status);
  return isPaidAp(status);
}

export function contractorIdsForCompany(db: Db, companyName: string): string[] {
  return getContactsForCompany(db, companyName).map((c) => c.id);
}

export function contractorCompanyName(
  db: Db,
  contractorId?: string
): string | undefined {
  if (!contractorId) return undefined;
  return db.contractors.find((c) => c.id === contractorId)?.company;
}

export function arBalanceSummary(invoices: CustomerInvoice[]): BalanceSummary {
  let openCount = 0;
  let openTotal = 0;
  let paidCount = 0;
  let paidTotal = 0;
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    if (isOpenAr(inv.status)) {
      openCount += 1;
      openTotal += inv.total;
    } else if (isPaidAr(inv.status)) {
      paidCount += 1;
      paidTotal += inv.total;
    }
  }
  return {
    openCount,
    openTotal: Math.round(openTotal * 100) / 100,
    paidCount,
    paidTotal: Math.round(paidTotal * 100) / 100,
  };
}

export function apBalanceSummary(rows: ApLedgerRow[]): BalanceSummary {
  let openCount = 0;
  let openTotal = 0;
  let paidCount = 0;
  let paidTotal = 0;
  for (const row of rows) {
    if (isOpenAp(row.status)) {
      openCount += 1;
      openTotal += row.amount;
    } else if (isPaidAp(row.status)) {
      paidCount += 1;
      paidTotal += row.amount;
    }
  }
  return {
    openCount,
    openTotal: Math.round(openTotal * 100) / 100,
    paidCount,
    paidTotal: Math.round(paidTotal * 100) / 100,
  };
}

export interface InvoicesForPartyOptions {
  officeId?: string;
  companyName?: string;
  contractorIds?: string[];
  contractorId?: string;
  bucket?: LedgerBucket;
  overdueOnly?: boolean;
  agingBucket?: AgingBucket;
}

export function invoicesForParty(
  db: Db,
  opts: InvoicesForPartyOptions = {}
): CustomerInvoice[] {
  const bucket = opts.bucket ?? "all";
  let list = invoicesForOffice(db, opts.officeId);

  let ids: Set<string> | undefined;
  if (opts.contractorId) {
    ids = new Set([opts.contractorId]);
  } else if (opts.companyName) {
    ids = new Set(contractorIdsForCompany(db, opts.companyName));
  } else if (opts.contractorIds?.length) {
    ids = new Set(opts.contractorIds);
  }

  if (ids) {
    list = list.filter((inv) => inv.contractorId && ids!.has(inv.contractorId));
  }

  list = list.filter((inv) => matchesBucketAr(inv.status, bucket));
  if (opts.overdueOnly) {
    list = list.filter((inv) => isOverdueAr(inv));
  }
  if (opts.agingBucket) {
    list = list.filter((inv) => agingBucketAr(inv) === opts.agingBucket);
  }
  return list;
}

function carrierToRow(db: Db, s: CarrierSettlement): ApLedgerRow {
  const carrier = getCarrier(db, s.carrierId);
  return {
    id: s.id,
    number: s.number,
    kind: "carrier",
    partyId: s.carrierId,
    partyName: carrier?.name ?? "Carrier",
    orderId: s.orderId,
    amount: s.netPay,
    status: s.status,
    issuedAt: s.issuedAt,
    dueDate: s.dueDate,
  };
}

function vendorToRow(db: Db, s: VendorSettlement): ApLedgerRow {
  return {
    id: s.id,
    number: s.number,
    kind: "vendor",
    partyId: s.vendorId,
    partyName: formatVendorSettlementTitle(db, s.vendorId, s.payeeKind),
    payeeKind: s.payeeKind,
    orderId: s.orderId,
    amount: s.netPay,
    status: s.status,
    issuedAt: s.issuedAt,
    dueDate: s.dueDate,
    vendorInvoiceNumber: s.vendorInvoiceNumber,
    source: s.source,
  };
}

export type ApKindFilter = "all" | "carrier" | "vendor";

export interface ApRowsForPartyOptions {
  officeId?: string;
  vendorId?: string;
  carrierId?: string;
  bucket?: LedgerBucket;
  kind?: ApKindFilter;
  disputedOnly?: boolean;
  overdueOnly?: boolean;
  agingBucket?: AgingBucket;
}

export function apRowsForParty(
  db: Db,
  opts: ApRowsForPartyOptions = {}
): ApLedgerRow[] {
  const bucket = opts.bucket ?? "all";
  const kind = opts.kind ?? "all";

  const rows: ApLedgerRow[] = [];

  if (kind === "all" || kind === "carrier") {
    let carriers = settlementsForOffice(db, opts.officeId);
    if (opts.carrierId) {
      carriers = carriers.filter((s) => s.carrierId === opts.carrierId);
    }
    rows.push(...carriers.map((s) => carrierToRow(db, s)));
  }

  if (kind === "all" || kind === "vendor") {
    let vendors = vendorSettlementsForOffice(db, opts.officeId);
    if (opts.vendorId) {
      vendors = vendors.filter((s) => s.vendorId === opts.vendorId);
    }
    rows.push(...vendors.map((s) => vendorToRow(db, s)));
  }

  return rows
    .filter((r) => matchesBucketAp(r.status, bucket))
    .filter((r) => !opts.disputedOnly || r.status === "disputed")
    .filter((r) => {
      if (!opts.overdueOnly) return true;
      if (!r.dueDate || r.status !== "approved") return false;
      return isOverdueApOpen(r.status, r.dueDate);
    })
    .filter((r) => {
      if (!opts.agingBucket) return true;
      if (r.status !== "approved" || !r.dueDate) return opts.agingBucket === "current";
      return agingBucketApOpen(r.status, r.dueDate) === opts.agingBucket;
    })
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export function apRowsForVendor(db: Db, vendorId: string, officeId?: string): ApLedgerRow[] {
  return apRowsForParty(db, { vendorId, officeId, bucket: "all", kind: "vendor" });
}

export function invoicesForCompany(
  db: Db,
  companyName: string,
  officeId?: string
): CustomerInvoice[] {
  return invoicesForParty(db, { companyName, officeId, bucket: "all" });
}

export function getCustomerInvoice(db: Db, invoiceId: string): CustomerInvoice | undefined {
  return db.customerInvoices.find((inv) => inv.id === invoiceId);
}

export function getCarrierSettlementById(
  db: Db,
  settlementId: string
): CarrierSettlement | undefined {
  return db.carrierSettlements.find((s) => s.id === settlementId);
}

export function getVendorSettlementById(
  db: Db,
  settlementId: string
): VendorSettlement | undefined {
  return db.vendorSettlements.find((s) => s.id === settlementId);
}

export type ApDocument =
  | { kind: "carrier"; settlement: CarrierSettlement }
  | { kind: "vendor"; settlement: VendorSettlement };

export function resolveApDocument(
  db: Db,
  id: string,
  kindHint?: ApRowKind
): ApDocument | undefined {
  if (kindHint === "carrier" || !kindHint) {
    const carrier = getCarrierSettlementById(db, id);
    if (carrier) return { kind: "carrier", settlement: carrier };
  }
  if (kindHint === "vendor" || !kindHint) {
    const vendor = getVendorSettlementById(db, id);
    if (vendor) return { kind: "vendor", settlement: vendor };
  }
  return undefined;
}

export function apDetailHref(id: string, kind: ApRowKind): string {
  return `/billing/ap/${id}?kind=${kind}`;
}

export interface InvoiceLineGroup {
  groupKey: string;
  tripNumber?: string;
  ticketNumbers: string[];
  lines: CustomerInvoiceLine[];
  subtotal: number;
}

export interface TicketLineGroup<T extends { id: string; deliveryTicketId?: string }> {
  groupKey: string;
  tripNumber?: string;
  ticketNumbers: string[];
  lines: T[];
  subtotal: number;
}

function ticketLabel(ticket: DeliveryTicket): string {
  return ticket.number ?? ticket.paperTicketNumber ?? ticket.id.slice(0, 8);
}

export function getTicketById(db: Db, ticketId?: string): DeliveryTicket | undefined {
  if (!ticketId) return undefined;
  return db.deliveryTickets.find((t) => t.id === ticketId);
}

export function getTicketForInvoiceLine(
  db: Db,
  line: CustomerInvoiceLine
): DeliveryTicket | undefined {
  return getTicketById(db, line.deliveryTicketId);
}

export function groupLinesByDeliveryTicket<
  T extends { id: string; deliveryTicketId?: string },
>(db: Db, lines: T[], amountOf: (line: T) => number): TicketLineGroup<T>[] {
  const groups: TicketLineGroup<T>[] = [];
  const indexByKey = new Map<string, number>();

  for (const line of lines) {
    const ticket = getTicketById(db, line.deliveryTicketId);
    const groupKey = ticket?.tripId ?? ticket?.id ?? line.id;

    let idx = indexByKey.get(groupKey);
    if (idx === undefined) {
      const trip = ticket?.tripId ? db.trips.find((t) => t.id === ticket.tripId) : undefined;
      idx = groups.length;
      indexByKey.set(groupKey, idx);
      groups.push({
        groupKey,
        tripNumber: trip?.number,
        ticketNumbers: [],
        lines: [],
        subtotal: 0,
      });
    }

    const group = groups[idx];
    group.lines.push(line);
    group.subtotal = Math.round((group.subtotal + amountOf(line)) * 100) / 100;
    if (ticket) {
      const label = ticketLabel(ticket);
      if (!group.ticketNumbers.includes(label)) {
        group.ticketNumbers.push(label);
      }
    }
  }

  return groups;
}

export function groupInvoiceLinesByTicket(
  db: Db,
  lines: CustomerInvoiceLine[]
): InvoiceLineGroup[] {
  return groupLinesByDeliveryTicket(db, lines, (line) => line.amount);
}
