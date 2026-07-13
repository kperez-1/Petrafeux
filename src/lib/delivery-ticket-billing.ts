import { DeliveryTicket, OrderLine } from "./types";
import { resolveMaterialBuyRate, resolveMaterialSellRate } from "./route-materials";

/** One physical ticket proves haul + delivery; billing may still split charges. */
export function isDeliveryTicket(ticket: DeliveryTicket): boolean {
  return ticket.lineType === "delivery";
}

export function actsAsHaulTicket(ticket: DeliveryTicket): boolean {
  return ticket.lineType === "haul" || ticket.lineType === "delivery";
}

export function withTicketLineType(
  ticket: DeliveryTicket,
  lineType: DeliveryTicket["lineType"]
): DeliveryTicket {
  return { ...ticket, lineType };
}

export function shouldBillMaterialOnDelivery(line: OrderLine): boolean {
  return resolveMaterialSellRate(line) > 0 || resolveMaterialBuyRate(line) > 0;
}

export function shouldBillDisposalOnDelivery(line: OrderLine): boolean {
  return (line.disposalSellRate ?? 0) > 0 || (line.disposalBuyRate ?? 0) > 0;
}

export function deliveryTicketLineLabel(lineType: DeliveryTicket["lineType"]): string {
  if (lineType === "delivery") return "Delivery";
  return lineType;
}

export function billingTicketVariants(
  ticket: DeliveryTicket,
  orderLine: OrderLine
): DeliveryTicket[] {
  if (!isDeliveryTicket(ticket)) return [ticket];
  const variants: DeliveryTicket[] = [withTicketLineType(ticket, "haul")];
  if (shouldBillMaterialOnDelivery(orderLine)) {
    variants.push(withTicketLineType(ticket, "material"));
  }
  if (shouldBillDisposalOnDelivery(orderLine)) {
    variants.push(withTicketLineType(ticket, "disposal"));
  }
  return variants;
}
