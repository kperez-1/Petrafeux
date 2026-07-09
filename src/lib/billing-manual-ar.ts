import { CustomerInvoice, CustomerInvoiceLine, Db } from "./types";
import { generateId } from "./utils";
import { generateInvoiceNumber } from "./storage";
import { computeDueDate, DEFAULT_PAYMENT_TERMS_DAYS } from "./payee-terms";

export interface ManualArInvoiceLineInput {
  description: string;
  qty: number;
  unit?: CustomerInvoiceLine["unit"];
  sellRate: number;
  taxable?: boolean;
}

export interface ManualArInvoiceInput {
  projectId: string;
  contractorId?: string;
  orderId?: string;
  dueDate?: string;
  termsDays?: number;
  attachmentUrl?: string;
  lines: ManualArInvoiceLineInput[];
}

export function createManualArInvoice(
  db: Db,
  input: ManualArInvoiceInput
): { db: Db; invoice: CustomerInvoice } {
  const project = db.projects.find((p) => p.id === input.projectId);
  if (!project) throw new Error("Project not found");
  if (input.lines.length === 0) throw new Error("At least one line is required");

  const lines: CustomerInvoiceLine[] = input.lines.map((l) => {
    const amount = Math.round(l.qty * l.sellRate * 100) / 100;
    return {
      id: generateId(),
      description: l.description.trim(),
      qty: l.qty,
      unit: l.unit ?? "LD",
      sellRate: l.sellRate,
      amount,
      taxable: l.taxable ?? false,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const taxRate = db.meta.defaultTaxRate ?? 0;
  const taxableSubtotal = lines.filter((l) => l.taxable).reduce((sum, l) => sum + l.amount, 0);
  const tax = Math.round(taxableSubtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  const issuedAt = new Date().toISOString();
  const terms = input.termsDays ?? DEFAULT_PAYMENT_TERMS_DAYS;
  const dueDate = input.dueDate || computeDueDate(issuedAt, terms);

  const counter = (db.meta.invoiceCounter ?? 0) + 1;
  const invoice: CustomerInvoice = {
    id: generateId(),
    number: generateInvoiceNumber(counter),
    projectId: input.projectId,
    contractorId: input.contractorId,
    orderId: input.orderId,
    status: "draft",
    subtotal,
    tax,
    total,
    issuedAt,
    dueDate,
    lines,
    source: "manual",
    attachmentUrl: input.attachmentUrl?.trim() || undefined,
  };

  return {
    db: {
      ...db,
      customerInvoices: [invoice, ...db.customerInvoices],
      meta: { ...db.meta, invoiceCounter: counter },
    },
    invoice,
  };
}
