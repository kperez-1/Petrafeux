"use client";

import { AgingBucket } from "@/lib/types";
import { AGING_BUCKET_LABELS, AgingSummaryRow } from "@/lib/billing-aging";
import { formatCurrency } from "@/lib/utils";

export function AgingSummaryStrip({
  rows,
  selected,
  onSelect,
}: {
  rows: AgingSummaryRow[];
  selected?: AgingBucket | "all";
  onSelect?: (bucket: AgingBucket | "all") => void;
}) {
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {onSelect && (
        <button
          type="button"
          onClick={() => onSelect("all")}
          className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
            selected === "all" || !selected
              ? "border-[#0f6b4f] bg-[#0f6b4f]/5"
              : "border-gray-200 bg-white hover:bg-gray-50"
          }`}
        >
          <p className="font-medium text-gray-700">All open</p>
        </button>
      )}
      {rows.map((row) => (
        <button
          key={row.bucket}
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(row.bucket)}
          className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
            selected === row.bucket
              ? "border-[#0f6b4f] bg-[#0f6b4f]/5"
              : "border-gray-200 bg-white hover:bg-gray-50 disabled:cursor-default"
          }`}
        >
          <p className="font-medium text-gray-700">{AGING_BUCKET_LABELS[row.bucket]}</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">{formatCurrency(row.total)}</p>
          <p className="text-gray-400">{row.count} doc{row.count === 1 ? "" : "s"}</p>
        </button>
      ))}
    </div>
  );
}
