import { Db, OrderLine } from "./types";
import { getOrder } from "./orders";
import { approvedTicketsForOrder } from "./delivery-tickets";
import { buildInvoiceLine } from "./billing-ar";
import {
  actsAsHaulTicket,
  billingTicketVariants,
  shouldBillMaterialOnDelivery,
} from "./delivery-ticket-billing";
import { resolveMaterialBuyRate, resolveMaterialSellRate } from "./route-materials";
import { getBrokerFeePercent } from "./db-defaults";
import { netHaulBuyRate } from "./margin-calc";

export interface ReconciliationSummary {
  quotedHaulQty: number;
  deliveredHaulQty: number;
  quotedMaterialQty: number;
  deliveredMaterialQty: number;
  quotedArTotal: number;
  deliveredArTotal: number;
  invoicedArTotal: number;
  paidApTotal: number;
  routeRows: OrderRouteBillingRow[];
}

export interface OrderRouteBillingRow {
  orderLineId: string;
  route: string;
  quotedQty: number;
  deliveredQty: number;
  haulRev: number;
  matRev: number;
  direct: number;
  haulGp: number;
  matGp: number;
  totalGp: number;
}

function routeLabel(line: OrderLine): string {
  return [line.pickupAddress, line.dropoffAddress].filter(Boolean).join(" → ");
}

function buildRouteRow(
  db: Db,
  line: OrderLine,
  brokerFeePercent: number
): OrderRouteBillingRow {
  const approved = approvedTicketsForOrder(db, line.orderId).filter(
    (t) => t.orderLineId === line.id
  );
  const deliveredHaulQty = approved
    .filter((t) => actsAsHaulTicket(t))
    .reduce((s, t) => s + t.qty, 0);
  const deliveredMatQty =
    approved
      .filter((t) => t.lineType === "material" || t.lineType === "disposal")
      .reduce((s, t) => s + t.qty, 0) +
    approved
      .filter((t) => t.lineType === "delivery" && shouldBillMaterialOnDelivery(line))
      .reduce((s, t) => s + t.qty, 0);
  const quotedQty = line.haulQtyQuoted + line.materialQtyQuoted;
  const deliveredQty = deliveredHaulQty + deliveredMatQty;

  const materialSell = resolveMaterialSellRate(line);
  const materialBuy = resolveMaterialBuyRate(line);
  const haulRev = Math.round(line.haulSellRate * deliveredHaulQty * 100) / 100;
  const matRev =
    Math.round(materialSell * deliveredMatQty * 100) / 100 +
    Math.round((line.disposalSellRate ?? 0) * deliveredMatQty * 100) / 100;

  const haulBuy = Math.round(line.haulBuyRate * deliveredHaulQty * 100) / 100;
  const matBuy =
    Math.round(materialBuy * deliveredMatQty * 100) / 100 +
    Math.round((line.disposalBuyRate ?? 0) * deliveredMatQty * 100) / 100;
  const haulNetBuy =
    Math.round(netHaulBuyRate(line.haulBuyRate, brokerFeePercent) * deliveredHaulQty * 100) /
    100;
  const direct = Math.round((haulBuy + matBuy) * 100) / 100;
  const haulGp = Math.round((haulRev - haulNetBuy) * 100) / 100;
  const matGp = Math.round((matRev - matBuy) * 100) / 100;

  return {
    orderLineId: line.id,
    route: routeLabel(line),
    quotedQty,
    deliveredQty,
    haulRev,
    matRev,
    direct,
    haulGp,
    matGp,
    totalGp: Math.round((haulGp + matGp) * 100) / 100,
  };
}

export function buildOrderReconciliation(db: Db, orderId: string): ReconciliationSummary {
  const order = getOrder(db, orderId);
  if (!order) {
    return {
      quotedHaulQty: 0,
      deliveredHaulQty: 0,
      quotedMaterialQty: 0,
      deliveredMaterialQty: 0,
      quotedArTotal: 0,
      deliveredArTotal: 0,
      invoicedArTotal: 0,
      paidApTotal: 0,
      routeRows: [],
    };
  }

  const brokerFeePercent = getBrokerFeePercent(db.meta);
  const routeRows = order.lines.map((line) => buildRouteRow(db, line, brokerFeePercent));

  const quotedHaulQty = order.lines.reduce((s, l) => s + l.haulQtyQuoted, 0);
  const quotedMaterialQty = order.lines.reduce((s, l) => s + l.materialQtyQuoted, 0);
  const quotedArTotal = order.lines.reduce(
    (s, l) =>
      s +
      l.haulSellRate * l.haulQtyQuoted +
      resolveMaterialSellRate(l) * l.materialQtyQuoted,
    0
  );

  const approved = approvedTicketsForOrder(db, orderId);
  const deliveredHaulQty = approved
    .filter((t) => actsAsHaulTicket(t))
    .reduce((s, t) => s + t.qty, 0);
  const deliveredMaterialQty =
    approved
      .filter((t) => t.lineType === "material" || t.lineType === "disposal")
      .reduce((s, t) => s + t.qty, 0) +
    order.lines.reduce((sum, line) => {
      const qty = approved
        .filter((t) => t.orderLineId === line.id && t.lineType === "delivery")
        .reduce((s, t) => s + t.qty, 0);
      return shouldBillMaterialOnDelivery(line) ? sum + qty : sum;
    }, 0);

  let deliveredArTotal = 0;
  for (const ticket of approved) {
    const orderLine = order.lines.find((l) => l.id === ticket.orderLineId);
    const variants = orderLine ? billingTicketVariants(ticket, orderLine) : [ticket];
    for (const variant of variants) {
      const line = buildInvoiceLine(db, variant);
      if (line) deliveredArTotal += line.amount;
    }
  }

  const invoicedArTotal = db.customerInvoices
    .filter((inv) => inv.orderId === orderId)
    .reduce((s, inv) => s + inv.total, 0);

  let paidApTotal = 0;
  for (const settlement of db.carrierSettlements.filter((s) => s.orderId === orderId)) {
    if (settlement.status === "paid") paidApTotal += settlement.netPay;
  }
  for (const settlement of db.vendorSettlements.filter((s) => s.orderId === orderId)) {
    if (settlement.status === "paid") paidApTotal += settlement.netPay;
  }

  return {
    quotedHaulQty,
    deliveredHaulQty,
    quotedMaterialQty,
    deliveredMaterialQty,
    quotedArTotal: Math.round(quotedArTotal * 100) / 100,
    deliveredArTotal: Math.round(deliveredArTotal * 100) / 100,
    invoicedArTotal: Math.round(invoicedArTotal * 100) / 100,
    paidApTotal: Math.round(paidApTotal * 100) / 100,
    routeRows,
  };
}

export function uninvoicedApprovedTickets(db: Db, orderId: string) {
  const invoicedIds = new Set(
    db.customerInvoices
      .flatMap((inv) => inv.lines.map((l) => l.deliveryTicketId))
      .filter(Boolean)
  );
  return approvedTicketsForOrder(db, orderId).filter((t) => !invoicedIds.has(t.id));
}

export function unsettledTicketsForCarrier(db: Db, orderId: string, carrierId: string) {
  const settledIds = new Set(
    db.carrierSettlements
      .flatMap((s) => s.lines.map((l) => l.deliveryTicketId))
      .filter(Boolean)
  );
  return approvedTicketsForOrder(db, orderId).filter((t) => {
    if (t.lineType !== "haul") return false;
    if (settledIds.has(t.id)) return false;
    const dispatch = db.dispatches.find((d) => d.id === t.dispatchId);
    return dispatch?.carrierId === carrierId;
  });
}
