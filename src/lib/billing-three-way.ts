import { Db, VendorSettlementLine, CarrierSettlementLine } from "./types";
import { getOrder } from "./orders";
import { getTicketById } from "./billing-ledger";

export interface ThreeWayMatchRow {
  lineId: string;
  description: string;
  orderQty?: number;
  orderRate?: number;
  ticketQty?: number;
  billedQty: number;
  billedRate: number;
  qtyDelta?: number;
  rateDelta?: number;
  hasMismatch: boolean;
}

function orderLineForSettlementLine(
  db: Db,
  orderLineId: string | undefined
) {
  if (!orderLineId) return undefined;
  for (const order of db.orders) {
    const line = order.lines.find((l) => l.id === orderLineId);
    if (line) return line;
  }
  return undefined;
}

export function threeWayMatchForCarrierLines(
  db: Db,
  orderId: string | undefined,
  lines: CarrierSettlementLine[]
): ThreeWayMatchRow[] {
  const order = orderId ? getOrder(db, orderId) : undefined;
  return lines.map((line) => {
    const orderLine = orderLineForSettlementLine(db, line.orderLineId);
    const ticket = getTicketById(db, line.deliveryTicketId);
    const orderQty = orderLine?.haulQtyQuoted;
    const orderRate = orderLine?.haulBuyRate;
    const ticketQty = ticket?.qty;
    const qtyDelta =
      ticketQty != null ? Math.round((line.qty - ticketQty) * 100) / 100 : undefined;
    const rateDelta =
      orderRate != null ? Math.round((line.buyRate - orderRate) * 100) / 100 : undefined;
    const hasMismatch =
      (qtyDelta != null && qtyDelta !== 0) || (rateDelta != null && rateDelta !== 0);
    return {
      lineId: line.id,
      description: line.description,
      orderQty: order ? orderQty : undefined,
      orderRate: order ? orderRate : undefined,
      ticketQty,
      billedQty: line.qty,
      billedRate: line.buyRate,
      qtyDelta,
      rateDelta,
      hasMismatch,
    };
  });
}

export function threeWayMatchForVendorLines(
  db: Db,
  orderId: string | undefined,
  lines: VendorSettlementLine[]
): ThreeWayMatchRow[] {
  const order = orderId ? getOrder(db, orderId) : undefined;
  return lines.map((line) => {
    const orderLine = orderLineForSettlementLine(db, line.orderLineId);
    const ticket = getTicketById(db, line.deliveryTicketId);
    const orderQty = orderLine?.materialQtyQuoted;
    const orderRate = orderLine?.materialBuyRate;
    const ticketQty = ticket?.qty;
    const qtyDelta =
      ticketQty != null ? Math.round((line.qty - ticketQty) * 100) / 100 : undefined;
    const rateDelta =
      orderRate != null ? Math.round((line.buyRate - orderRate) * 100) / 100 : undefined;
    const hasMismatch =
      (qtyDelta != null && qtyDelta !== 0) || (rateDelta != null && rateDelta !== 0);
    return {
      lineId: line.id,
      description: line.description,
      orderQty: order ? orderQty : undefined,
      orderRate: order ? orderRate : undefined,
      ticketQty,
      billedQty: line.qty,
      billedRate: line.buyRate,
      qtyDelta,
      rateDelta,
      hasMismatch,
    };
  });
}
