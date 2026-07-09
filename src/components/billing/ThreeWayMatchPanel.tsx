"use client";

import { formatCurrency } from "@/lib/utils";
import { ThreeWayMatchRow } from "@/lib/billing-three-way";

export function ThreeWayMatchPanel({ rows }: { rows: ThreeWayMatchRow[] }) {
  if (rows.length === 0) return null;

  const mismatches = rows.filter((r) => r.hasMismatch).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">3-way match</h3>
        <p className="text-xs text-gray-500">
          Order vs ticket vs payable line
          {mismatches > 0 && (
            <span className="ml-1 text-amber-700">· {mismatches} mismatch(es)</span>
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Line</th>
              <th className="px-3 py-2 font-medium text-right">Order qty</th>
              <th className="px-3 py-2 font-medium text-right">Ticket qty</th>
              <th className="px-3 py-2 font-medium text-right">Billed qty</th>
              <th className="px-3 py-2 font-medium text-right">Order rate</th>
              <th className="px-3 py-2 font-medium text-right">Billed rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.lineId}
                className={`border-b border-gray-50 ${row.hasMismatch ? "bg-amber-50/60" : ""}`}
              >
                <td className="px-3 py-2 text-gray-900">{row.description}</td>
                <td className="px-3 py-2 text-right text-gray-600">{row.orderQty ?? "—"}</td>
                <td className="px-3 py-2 text-right text-gray-600">{row.ticketQty ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium">{row.billedQty}</td>
                <td className="px-3 py-2 text-right text-gray-600">
                  {row.orderRate != null ? formatCurrency(row.orderRate) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {formatCurrency(row.billedRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
