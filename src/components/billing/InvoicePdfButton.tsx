"use client";

import { FileText } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { openCustomerInvoicePdf } from "@/lib/invoice-pdf";
import type { CustomerInvoice } from "@/lib/types";

export function InvoicePdfButton({ invoice }: { invoice: CustomerInvoice }) {
  const { db } = useDb();

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-medium text-[#0f6b4f] hover:underline"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openCustomerInvoicePdf(invoice, db);
      }}
    >
      <FileText className="h-3.5 w-3.5" />
      PDF
    </button>
  );
}
