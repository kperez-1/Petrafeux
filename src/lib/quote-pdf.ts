import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { calcQuote } from "./quote-calc";
import { getRouteMaterials } from "./route-materials";
import { formatCurrency } from "./utils";
import type { Db, Quote } from "./types";
import { normalizeMaterialUnit, unitRateLabel } from "./types";

export interface QuotePdfLine {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

export function buildQuotePdfLines(quote: Quote): QuotePdfLine[] {
  const lines: QuotePdfLine[] = [];

  for (const route of quote.routes) {
    const routeLabel = [route.pickupAddress, route.dropoffAddress].filter(Boolean).join(" → ");

    for (const mat of getRouteMaterials(route)) {
      const unit = normalizeMaterialUnit(mat.materialUnit);
      lines.push({
        description: `${mat.materialName || "Material"}${routeLabel ? ` (${routeLabel})` : ""}`,
        qty: mat.materialQty,
        unit,
        rate: mat.materialCost,
        amount: mat.materialCost * mat.materialQty,
      });
    }

    if (route.haulQty > 0) {
      const hUnit = normalizeMaterialUnit(route.haulUnit);
      lines.push({
        description: `Hauling${routeLabel ? ` — ${routeLabel}` : ""}`,
        qty: route.haulQty,
        unit: hUnit,
        rate: route.haulRate,
        amount: route.haulRate * route.haulQty,
      });
    }
  }

  return lines;
}

export function buildQuoteProposalPdf(quote: Quote, db: Db): jsPDF {
  const project = db.projects.find((p) => p.id === quote.projectId);
  const contractor = quote.contractorId
    ? db.contractors.find((c) => c.id === quote.contractorId)
    : undefined;
  const calc = calcQuote(quote, db.meta);
  const orgName = db.meta.orgName ?? "Petrafi";

  const doc = new jsPDF();
  let y = 18;

  doc.setFontSize(18);
  doc.text("Proposal", 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(orgName, 14, y);
  y += 6;
  doc.setTextColor(0);
  doc.text(`Quote ${quote.number}`, 14, y);
  doc.text(`Date: ${new Date(quote.createdAt).toLocaleDateString()}`, 120, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Customer", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const customerName =
    contractor
      ? `${contractor.firstName} ${contractor.lastName}`.trim() || quote.contractorName
      : quote.contractorName || "—";
  doc.text(customerName ?? "—", 14, y);
  y += 5;
  if (contractor?.company) {
    doc.text(contractor.company, 14, y);
    y += 5;
  }
  if (contractor?.email) {
    doc.text(contractor.email, 14, y);
    y += 5;
  }
  if (contractor?.phone) {
    doc.text(contractor.phone, 14, y);
    y += 5;
  }
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Job information", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Job name: ${quote.jobName}`, 14, y);
  y += 5;
  if (project?.name && project.name !== quote.jobName) {
    doc.text(`Project: ${project.name}`, 14, y);
    y += 5;
  }
  if (project?.address) {
    doc.text(`Location: ${project.address}`, 14, y);
    y += 5;
  }
  y += 4;

  const tableRows = buildQuotePdfLines(quote).map((line) => [
    line.description,
    String(line.qty),
    line.unit,
    `${unitRateLabel(line.unit as import("./types").MaterialPriceUnit)} ${line.rate.toFixed(2)}`,
    formatCurrency(line.amount),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Description", "Qty", "Unit", "Rate", "Amount"]],
    body:
      tableRows.length > 0
        ? tableRows
        : [["No line items", "—", "—", "—", "—"]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 107, 79] },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  let ty = finalY + 10;
  doc.setFontSize(10);
  doc.text(`Subtotal: ${formatCurrency(calc.subtotal)}`, 140, ty);
  ty += 6;
  doc.text(`Tax (material): ${formatCurrency(calc.tax)}`, 140, ty);
  ty += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${formatCurrency(calc.total)}`, 140, ty);

  return doc;
}

export function openQuoteProposalPdf(quote: Quote, db: Db): void {
  const doc = buildQuoteProposalPdf(quote, db);
  doc.save(`Proposal-${quote.number}.pdf`);
}

export function quoteProposalPdfBase64(quote: Quote, db: Db): string {
  const doc = buildQuoteProposalPdf(quote, db);
  const dataUri = doc.output("datauristring");
  const base64 = dataUri.split(",")[1] ?? "";
  return base64;
}
