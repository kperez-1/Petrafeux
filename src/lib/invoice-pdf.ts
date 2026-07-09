import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency } from "./utils";
import type { CustomerInvoice, Db } from "./types";
import { unitRateLabel } from "./types";
import { getOrder } from "./orders";
import { getTicketForInvoiceLine, groupInvoiceLinesByTicket } from "./billing-ledger";

export function buildCustomerInvoicePdf(invoice: CustomerInvoice, db: Db): jsPDF {
  const order = invoice.orderId ? getOrder(db, invoice.orderId) : undefined;
  const project = db.projects.find((p) => p.id === invoice.projectId);
  const contractor = invoice.contractorId
    ? db.contractors.find((c) => c.id === invoice.contractorId)
    : undefined;
  const orgName = db.meta.orgName ?? "Petrafi";

  const doc = new jsPDF();
  let y = 18;

  doc.setFontSize(18);
  doc.text("Invoice", 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(orgName, 14, y);
  y += 6;
  doc.setTextColor(0);
  doc.text(`Invoice ${invoice.number}`, 14, y);
  doc.text(`Date: ${new Date(invoice.issuedAt).toLocaleDateString()}`, 120, y);
  y += 6;
  if (invoice.dueDate) {
    doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`, 120, y);
    y += 4;
  }
  y += 6;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Bill to", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const customerName = contractor
    ? `${contractor.firstName} ${contractor.lastName}`.trim() || contractor.company
    : "—";
  doc.text(customerName, 14, y);
  y += 5;
  if (contractor?.company) {
    doc.text(contractor.company, 14, y);
    y += 5;
  }
  if (contractor?.email) {
    doc.text(contractor.email, 14, y);
    y += 5;
  }
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Job information", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Job name: ${order?.jobName ?? "—"}`, 14, y);
  y += 5;
  if (order?.number) {
    doc.text(`Order: ${order.number}`, 14, y);
    y += 5;
  }
  if (project?.address) {
    doc.text(`Location: ${project.address}`, 14, y);
    y += 5;
  }
  y += 4;

  const tableRows: (string | number)[][] = [];
  const groups = groupInvoiceLinesByTicket(db, invoice.lines);
  for (const group of groups) {
    if (group.tripNumber || group.ticketNumbers.length > 1) {
      const header = [
        group.tripNumber ? `Trip ${group.tripNumber}` : "",
        group.ticketNumbers.length ? `Tickets: ${group.ticketNumbers.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      tableRows.push([header, "", "", "", ""]);
    }
    for (const line of group.lines) {
      const ticket = getTicketForInvoiceLine(db, line);
      const ticketRef = ticket?.number ?? ticket?.paperTicketNumber ?? "";
      tableRows.push([
        ticketRef,
        line.description,
        String(line.qty),
        line.unit,
        `${unitRateLabel(line.unit)} ${line.sellRate.toFixed(2)}`,
        formatCurrency(line.amount),
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Ticket", "Description", "Qty", "Unit", "Rate", "Amount"]],
    body: tableRows.length > 0 ? tableRows : [["—", "No line items", "—", "—", "—", "—"]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 107, 79] },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  let ty = finalY + 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Subtotal: ${formatCurrency(invoice.subtotal)}`, 140, ty);
  ty += 6;
  doc.text(`Tax: ${formatCurrency(invoice.tax)}`, 140, ty);
  ty += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${formatCurrency(invoice.total)}`, 140, ty);

  return doc;
}

export function openCustomerInvoicePdf(invoice: CustomerInvoice, db: Db): void {
  const doc = buildCustomerInvoicePdf(invoice, db);
  doc.save(`Invoice-${invoice.number}.pdf`);
}

export function customerInvoicePdfBase64(invoice: CustomerInvoice, db: Db): string {
  const doc = buildCustomerInvoicePdf(invoice, db);
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1] ?? "";
}
