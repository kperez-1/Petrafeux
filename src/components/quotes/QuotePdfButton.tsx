"use client";

import { FileText } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { openQuoteProposalPdf } from "@/lib/quote-pdf";
import type { Quote } from "@/lib/types";

export function QuotePdfButton({ quote }: { quote: Quote }) {
  const { db } = useDb();

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-medium text-[#0f6b4f] hover:underline"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openQuoteProposalPdf(quote, db);
      }}
    >
      <FileText className="h-3.5 w-3.5" />
      PDF
    </button>
  );
}
