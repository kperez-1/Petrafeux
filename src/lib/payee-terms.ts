import { Carrier, Vendor } from "./types";

export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

export function paymentTermsDaysForVendor(vendor: Vendor | undefined): number {
  return vendor?.paymentTermsDays ?? DEFAULT_PAYMENT_TERMS_DAYS;
}

export function paymentTermsDaysForCarrier(carrier: Carrier | undefined): number {
  return carrier?.paymentTermsDays ?? DEFAULT_PAYMENT_TERMS_DAYS;
}

export function computeDueDate(issuedAt: string, termsDays: number): string {
  const d = new Date(issuedAt);
  d.setDate(d.getDate() + termsDays);
  return d.toISOString().slice(0, 10);
}
