import { AgingBucket, CarrierSettlement, CustomerInvoice, VendorSettlement } from "./types";

function daysPastDue(dueDate: string, asOf = new Date()): number {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date(asOf);
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - due.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function agingBucketFromDaysPastDue(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

export function agingBucketForDueDate(dueDate: string | undefined, asOf = new Date()): AgingBucket {
  if (!dueDate) return "current";
  return agingBucketFromDaysPastDue(daysPastDue(dueDate, asOf));
}

export function isOverdueAr(invoice: CustomerInvoice, asOf = new Date()): boolean {
  if (invoice.status !== "sent" || !invoice.dueDate) return false;
  return daysPastDue(invoice.dueDate, asOf) > 0;
}

export function agingBucketAr(invoice: CustomerInvoice, asOf = new Date()): AgingBucket {
  if (invoice.status === "paid" || invoice.status === "void") return "current";
  if (invoice.status !== "sent" || !invoice.dueDate) return "current";
  return agingBucketForDueDate(invoice.dueDate, asOf);
}

export function isOverdueAp(
  doc: CarrierSettlement | VendorSettlement,
  asOf = new Date()
): boolean {
  if (doc.status !== "approved" || !doc.dueDate) return false;
  return daysPastDue(doc.dueDate, asOf) > 0;
}

export function isOverdueApOpen(
  status: CarrierSettlement["status"] | VendorSettlement["status"],
  dueDate: string | undefined,
  asOf = new Date()
): boolean {
  if (status !== "approved" || !dueDate) return false;
  return daysPastDue(dueDate, asOf) > 0;
}

export function agingBucketAp(
  doc: CarrierSettlement | VendorSettlement,
  asOf = new Date()
): AgingBucket {
  if (doc.status === "paid") return "current";
  if (doc.status !== "approved" || !doc.dueDate) return "current";
  return agingBucketForDueDate(doc.dueDate, asOf);
}

/** Ledger row helper when only status + dueDate are available */
export function agingBucketApOpen(
  status: CarrierSettlement["status"] | VendorSettlement["status"],
  dueDate: string | undefined,
  asOf = new Date()
): AgingBucket {
  if (status === "paid") return "current";
  if (status !== "approved" || !dueDate) return "current";
  return agingBucketForDueDate(dueDate, asOf);
}

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "90+ days",
};

export interface AgingSummaryRow {
  bucket: AgingBucket;
  count: number;
  total: number;
}

export function summarizeAging<T>(
  items: T[],
  bucketFn: (item: T) => AgingBucket,
  amountFn: (item: T) => number
): AgingSummaryRow[] {
  const buckets: AgingBucket[] = ["current", "1_30", "31_60", "61_90", "90_plus"];
  return buckets.map((bucket) => {
    const matched = items.filter((item) => bucketFn(item) === bucket);
    return {
      bucket,
      count: matched.length,
      total: Math.round(matched.reduce((sum, item) => sum + amountFn(item), 0) * 100) / 100,
    };
  });
}
