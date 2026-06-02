"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-yellow-100 text-yellow-800 border-yellow-200",
  unsent: "bg-gray-100 text-gray-600 border-gray-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

export default function QuotesPage() {
  const { db } = useDb();
  const [search, setSearch] = useState("");

  const filtered = db.quotes.filter(
    (q) =>
      q.jobName.toLowerCase().includes(search.toLowerCase()) ||
      q.number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
          <FileText className="h-6 w-6 text-gray-500" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quotes</h1>
          <p className="text-sm text-gray-500">All quotes across all projects</p>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search quotes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">No.</th>
              <th className="px-4 py-3 text-left font-medium">Job Name</th>
              <th className="px-4 py-3 text-left font-medium">Project</th>
              <th className="px-4 py-3 text-left font-medium">Contractor</th>
              <th className="px-4 py-3 text-left font-medium">Total</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No quotes yet.
                </td>
              </tr>
            )}
            {filtered.map((quote) => {
              const routeTotal = quote.routes.reduce((sum, r) => sum + r.haulCost + r.materialCost, 0);
              const taxable = quote.routes.filter(r => r.taxable).reduce((sum, r) => sum + r.haulCost + r.materialCost, 0);
              const total = routeTotal + taxable * (quote.taxRate / 100);
              return (
                <tr key={quote.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/quotes/${quote.id}`} className="font-mono text-xs text-gray-500 hover:text-[#0f6b4f]">
                      {quote.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/quotes/${quote.id}`} className="hover:text-[#0f6b4f]">{quote.jobName}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <Link href={`/projects/${quote.projectId}`} className="hover:text-[#0f6b4f]">
                      {quote.projectName || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{quote.contractorName || "—"}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(total)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[quote.status]}`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(quote.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
            {filtered.length} row{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
