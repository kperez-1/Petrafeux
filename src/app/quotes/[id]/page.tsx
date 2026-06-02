"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Send, RefreshCw, Copy, Eye, CheckCircle, XCircle } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-yellow-100 text-yellow-800 border-yellow-200",
  unsent: "bg-gray-100 text-gray-600 border-gray-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, save } = useDb();

  const quote = db.quotes.find((q) => q.id === id);
  const project = quote ? db.projects.find((p) => p.id === quote.projectId) : null;
  const contractor = quote?.contractorId
    ? db.contractors.find((c) => c.id === quote.contractorId)
    : null;

  if (!quote) {
    return (
      <div className="p-8 text-gray-400">
        Quote not found. <Link href="/quotes" className="text-[#0f6b4f] underline">Back to quotes</Link>
      </div>
    );
  }

  // Summary calculations
  const routeSums = quote.routes.map((r) => ({
    subtotal: r.haulCost + r.materialCost,
    taxable: r.taxable,
  }));
  const subtotal = routeSums.reduce((s, r) => s + r.subtotal, 0);
  const taxableAmt = routeSums.filter(r => r.taxable).reduce((s, r) => s + r.subtotal, 0);
  const tax = taxableAmt * (quote.taxRate / 100);
  const total = subtotal + tax;

  // Gross profit (example: haul GP = haul cost - (haul cost * 0.65), material GP = sell - cost)
  const haulingGP = quote.routes.reduce((s, r) => s + (r.haulCost - r.haulRate * r.haulQty), 0);
  const materialGP = quote.routes.reduce((s, r) => s + (r.materialCost - r.materialRate * r.materialQty), 0);

  async function setStatus(status: "approved" | "rejected" | "sent") {
    await save({ ...db, quotes: db.quotes.map((q) => q.id === id ? { ...q, status } : q) });
  }

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/quotes" className="hover:text-gray-900">Quotes</Link>
          <span>›</span>
          <span className="text-gray-900">{project?.name || quote.jobName}</span>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <button onClick={() => history.back()} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{project?.name || quote.jobName}</h1>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[quote.status]}`}>
                {quote.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {quote.number} · {contractor ? `${contractor.firstName} ${contractor.lastName}` : "No contractor"} · v1
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Eye className="h-4 w-4" /> View Quote
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Send className="h-4 w-4" /> Resend
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> New Revision
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
          </div>
        </div>

        {/* Section 1: Contractor */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f6b4f] text-sm font-semibold text-white">
              1
            </div>
            <h2 className="text-base font-semibold text-gray-900">Contractor</h2>
          </div>
          {contractor ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-gray-400">Company</p><p className="text-gray-800">{contractor.company}</p></div>
              <div />
              <div><p className="text-xs text-gray-400">First Name</p><p className="text-gray-800">{contractor.firstName}</p></div>
              <div><p className="text-xs text-gray-400">Last Name</p><p className="text-gray-800">{contractor.lastName}</p></div>
              <div><p className="text-xs text-gray-400">Email</p><p className="text-gray-800">{contractor.email}</p></div>
              <div><p className="text-xs text-gray-400">Company Name</p><p className="text-gray-800">{contractor.company}</p></div>
              <div><p className="text-xs text-gray-400">Phone</p><p className="text-gray-800">{contractor.phone}</p></div>
              <div><p className="text-xs text-gray-400">Address</p><p className="text-gray-800">{contractor.address || "—"}</p></div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No contractor assigned.</p>
          )}
        </div>

        {/* Section 2: Basic Info */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f6b4f] text-sm font-semibold text-white">
              2
            </div>
            <h2 className="text-base font-semibold text-gray-900">Basic Info</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-gray-400">Project</p><p className="text-gray-800">{project?.name || "—"}</p></div>
            <div><p className="text-xs text-gray-400">Job Name</p><p className="text-gray-800">{quote.jobName}</p></div>
            <div><p className="text-xs text-gray-400">Job Location</p><p className="text-gray-800">{project?.address || "—"}</p></div>
            <div><p className="text-xs text-gray-400">Tax Rate</p><p className="text-gray-800">{quote.taxRate}%</p></div>
          </div>
        </div>

        {/* Section 3: Routes */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f6b4f] text-sm font-semibold text-white">
              3
            </div>
            <h2 className="text-base font-semibold text-gray-900">Routes</h2>
          </div>
          {quote.routes.length === 0 && (
            <p className="text-sm text-gray-400">No routes on this quote.</p>
          )}
          {quote.routes.map((route, i) => (
            <div key={route.id} className="mb-4 rounded-lg border border-gray-100 p-4">
              <div className="mb-3 flex items-center gap-3 text-sm">
                <span className="text-gray-600 font-medium truncate max-w-[220px]">{route.pickupAddress}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-600 font-medium truncate max-w-[220px]">{route.dropoffAddress}</span>
              </div>
              {/* Hauling row */}
              <div className="mb-2 rounded-md bg-gray-50 px-3 py-2">
                <span className="mr-2 rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">Hauling</span>
                <span className="text-sm text-gray-700">hauling</span>
                <span className="float-right text-sm text-gray-700">
                  {formatCurrency(route.haulRate)} · {formatCurrency(route.haulCost)} · {route.haulQty} ton
                </span>
              </div>
              {/* Material row */}
              {route.materialName && (
                <div className="rounded-md bg-gray-50 px-3 py-2">
                  <span className="mr-2 rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">Material</span>
                  <span className="text-sm font-medium text-gray-700">{route.materialType}</span>
                  <span className="ml-1 text-sm text-gray-500">{route.materialName}</span>
                  <span className="float-right text-sm text-gray-700">
                    {formatCurrency(route.materialRate)} · {formatCurrency(route.materialCost)} · {route.materialQty} ton
                  </span>
                  <div className="mt-1 text-xs text-gray-400">
                    {route.taxable ? "Taxable · Hauling & material linked" : "Non-taxable"}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* History */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-3 text-base font-semibold text-gray-900">History</h2>
          <div className="text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-gray-400" />
              <span>Quote created — {formatDate(quote.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary panel */}
      <div className="w-[280px] shrink-0 border-l border-gray-200 bg-white p-6 overflow-y-auto">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Summary</h2>

        <div className="space-y-2 text-sm">
          {quote.routes.map((route, i) => {
            const routeTotal = route.haulCost + route.materialCost;
            return (
              <div key={route.id} className="flex justify-between">
                <span className="text-gray-500">Route #{i + 1}</span>
                <span className="font-medium text-gray-900">{formatCurrency(routeTotal)}</span>
              </div>
            );
          })}
        </div>

        <div className="my-4 border-t border-gray-100" />

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Tax ({quote.taxRate}%)</span>
            <span>{formatCurrency(tax)}</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="my-4 border-t border-gray-100" />

        <div className="space-y-1.5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Gross Profit (Estimate, Internal)
          </p>
          <div className="flex justify-between text-gray-500">
            <span>Hauling GP</span>
            <span className={haulingGP >= 0 ? "text-green-700" : "text-red-600"}>{formatCurrency(haulingGP)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Material GP</span>
            <span className={materialGP >= 0 ? "text-green-700" : "text-red-600"}>{formatCurrency(materialGP)}</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900">
            <span>Total GP</span>
            <span>{formatCurrency(haulingGP + materialGP)}</span>
          </div>
          <p className="text-[11px] text-gray-400">
            Brokerage Fee/Rate (5%–10%) is not considered for the GP/Margins calculations at this stage.
          </p>
        </div>

        <div className="my-4 border-t border-gray-100" />

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1"
            onClick={() => setStatus("approved")}
          >
            <CheckCircle className="h-4 w-4" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1"
            onClick={() => setStatus("rejected")}
          >
            <XCircle className="h-4 w-4" /> Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
