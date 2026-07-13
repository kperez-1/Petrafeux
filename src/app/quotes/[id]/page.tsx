"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Send,
  Copy,
  CheckCircle,
  XCircle,
  Pencil,
  Clock,
  ShoppingCart,
} from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getBrokerFeePercent } from "@/lib/db-defaults";
import {
  calcQuote,
  haulBrokerIncomePerTon,
  netHaulBuyRate,
  allInUnitRate,
} from "@/lib/quote-calc";
import { duplicateQuote, appendQuoteHistory, parseSentRecipients } from "@/lib/quote-actions";
import { getRouteMaterials } from "@/lib/route-materials";
import { ActivitiesPanel } from "@/components/activities/ActivitiesPanel";
import { getActivitiesForQuote } from "@/lib/activities";
import { Quote, QuoteHistoryEvent, normalizeMaterialUnit, unitQtyLabel, unitRateLabel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { QuotePdfButton } from "@/components/quotes/QuotePdfButton";
import { QuoteSendSheet } from "@/components/quotes/QuoteSendSheet";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-yellow-100 text-yellow-800 border-yellow-200",
  unsent: "bg-gray-100 text-gray-600 border-gray-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

const HISTORY_LABELS: Record<QuoteHistoryEvent["type"], string> = {
  created: "Quote created",
  sent: "Quote sent",
  approved: "Quote approved",
  rejected: "Quote rejected",
  duplicated_from: "Duplicated from",
};

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, save } = useDb();
  const router = useRouter();
  const [sendOpen, setSendOpen] = useState(false);

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

  const currentQuote: Quote = quote;

  const brokerFeePercent = getBrokerFeePercent(db.meta);
  const quoteCalc = calcQuote(currentQuote, db.meta);
  const { subtotal, tax, total } = quoteCalc;
  const { haulBrokerIncome, haulingGP, materialGP } = quoteCalc;

  const quoteActivities = getActivitiesForQuote(db, currentQuote);
  const quoteOrders = db.orders.filter((o) => o.quoteId === currentQuote.id);

  const quoteHistory: QuoteHistoryEvent[] =
    currentQuote.history?.length
      ? [...currentQuote.history].sort(
          (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
        )
      : [{ id: "created", type: "created", at: currentQuote.createdAt }];

  async function updateQuote(next: Quote) {
    await save({
      ...db,
      quotes: db.quotes.map((q) => (q.id === id ? next : q)),
    });
  }

  async function handleDuplicate() {
    const result = duplicateQuote(db, id);
    if (result) {
      await save(result.db);
      router.push(`/quotes/${result.newQuoteId}/edit`);
    }
  }

  async function setStatus(status: "approved" | "rejected") {
    const updated = appendQuoteHistory(
      { ...currentQuote, status },
      status
    );
    await updateQuote(updated);
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/quotes" className="hover:text-gray-900">Quotes</Link>
          <span>›</span>
          <span className="text-gray-900">{project?.name || quote.jobName}</span>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <button onClick={() => history.back()} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{project?.name || quote.jobName}</h1>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[quote.status]}`}
              >
                {quote.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {quote.number} · {contractor ? `${contractor.firstName} ${contractor.lastName}` : "No contractor"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {quote.status === "approved" && (
              <Button
                size="sm"
                className="bg-[#1e3a5f] hover:bg-[#172e4d] text-white gap-1.5"
                onClick={() => router.push(`/quotes/${id}/create-order`)}
              >
                <ShoppingCart className="h-4 w-4" /> Create Order
              </Button>
            )}
            <Button
              size="sm"
              className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1.5"
              onClick={() => router.push(`/quotes/${id}/edit`)}
            >
              <Pencil className="h-4 w-4" /> Edit Quote
            </Button>
            <QuotePdfButton quote={currentQuote} />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSendOpen(true)}
            >
              <Send className="h-4 w-4" /> {currentQuote.status === "sent" ? "Send again" : "Send"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDuplicate}>
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f6b4f] text-sm font-semibold text-white">
              1
            </div>
            <h2 className="text-base font-semibold text-gray-900">Contractor</h2>
          </div>
          {contractor ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">Name</p>
                <p className="text-gray-800">
                  {contractor.firstName} {contractor.lastName}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Company</p>
                <p className="text-gray-800">{contractor.company || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-gray-800">{contractor.email || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Phone</p>
                <p className="text-gray-800">{contractor.phone || "—"}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No contractor assigned.</p>
          )}
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f6b4f] text-sm font-semibold text-white">
              2
            </div>
            <h2 className="text-base font-semibold text-gray-900">Basic Info</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">Project</p>
              <p className="text-gray-800">{project?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Job Name</p>
              <p className="text-gray-800">{quote.jobName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Job Location</p>
              <p className="text-gray-800">{project?.address || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Tax Rate</p>
              <p className="text-gray-800">{quote.taxRate}% (material only)</p>
            </div>
          </div>
        </div>

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
          {quote.routes.map((route) => (
            <div key={route.id} className="mb-4 rounded-lg border border-gray-100 p-4">
              <div className="mb-3 flex items-center gap-3 text-sm">
                <span className="font-medium text-gray-600 truncate max-w-[220px]">
                  {route.pickupAddress || "—"}
                </span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-gray-600 truncate max-w-[220px]">
                  {route.dropoffAddress || "—"}
                </span>
              </div>
              <div className="mb-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <span className="mr-2 rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                  Hauling
                </span>
                Buy {formatCurrency(route.haulCost)} (net{" "}
                {formatCurrency(netHaulBuyRate(route.haulCost, brokerFeePercent))}{" "}
                {unitRateLabel(route.haulUnit)}) · Broker{" "}
                {formatCurrency(haulBrokerIncomePerTon(route.haulCost, brokerFeePercent))}{" "}
                {unitRateLabel(route.haulUnit)} · Sell {formatCurrency(route.haulRate)} ·{" "}
                {route.haulQty} {unitQtyLabel(route.haulUnit)}
              </div>
              {getRouteMaterials(route).map((line, mi) => {
                const allIn = allInUnitRate(
                  line.materialCost,
                  line.materialUnit,
                  route.haulRate,
                  route.haulUnit
                );
                return (
                  <div
                    key={line.id}
                    className={`rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700 ${mi > 0 ? "mt-2" : ""}`}
                  >
                    <div>
                      <span className="mr-2 rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                        Material{getRouteMaterials(route).length > 1 ? ` #${mi + 1}` : ""}
                      </span>
                      {line.materialName || "—"} · Buy {formatCurrency(line.materialRate)} · Sell{" "}
                      {formatCurrency(line.materialCost)} · {line.materialQty}{" "}
                      {line.materialUnit ?? "TN"}
                    </div>
                    <div className="mt-1 text-xs font-medium text-[#0f6b4f]">
                      {allIn.combined != null
                        ? `All-in ${formatCurrency(allIn.combined)} ${unitRateLabel(allIn.unit)} (material + hauling)`
                        : `All-in ${formatCurrency(allIn.materialSell)} ${unitRateLabel(allIn.unit)} + haul ${formatCurrency(allIn.haulSell)} ${unitRateLabel(allIn.haulUnit)}`}
                    </div>
                  </div>
                );
              })}
              {getRouteMaterials(route).length === 0 && (
                <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <span className="mr-2 rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                    Hauling only
                  </span>
                  {formatCurrency(route.haulRate)} {unitRateLabel(normalizeMaterialUnit(route.haulUnit))}
                </div>
              )}
              {getRouteMaterials(route).length > 0 && (
                <div className="mt-1 text-xs text-gray-400">
                  {route.taxable ? "Materials taxable" : "Materials non-taxable"}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6">
          <ActivitiesPanel
            activities={quoteActivities}
            createDefaults={{
              projectId: quote.projectId,
              contractorId: quote.contractorId,
              company: contractor?.company,
            }}
          />
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-3 text-base font-semibold text-gray-900">History</h2>
          <div className="space-y-2 text-sm text-gray-500">
            {quoteHistory.map((event) => {
              const sentTo =
                event.type === "sent" ? parseSentRecipients(event.note) : [];
              const noteText =
                event.type === "sent" && sentTo.length
                  ? ` — Sent to ${sentTo.map((r) => r.email).join(", ")}`
                  : event.note && event.type !== "sent"
                    ? ` — ${event.note}`
                    : event.type === "duplicated_from" && event.note
                      ? ` — ${event.note}`
                      : "";
              return (
                <div key={event.id} className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <span>
                    {HISTORY_LABELS[event.type]}
                    {noteText} · {formatDate(event.at)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <QuoteSendSheet quote={currentQuote} open={sendOpen} onOpenChange={setSendOpen} />

      <div className="w-[280px] shrink-0 border-l border-gray-200 bg-white p-6 overflow-y-auto">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Summary</h2>

        <div className="my-4 border-t border-gray-100" />

        {quote.status === "approved" && (
          <>
            <div className="mb-4 space-y-1 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Orders
              </p>
              {quoteOrders.length === 0 ? (
                <p className="text-gray-500">No orders yet from this quote.</p>
              ) : (
                quoteOrders.map((o) => (
                  <Link
                    key={o.id}
                    href={`/orders/${o.id}`}
                    className="block text-[#0f6b4f] hover:underline"
                  >
                    {o.number}
                  </Link>
                ))
              )}
            </div>
            <div className="my-4 border-t border-gray-100" />
          </>
        )}

        <div className="space-y-2 text-sm">
          {quote.routes.map((route, i) => (
            <div key={route.id} className="flex justify-between">
              <span className="text-gray-500">Route #{i + 1}</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(quoteCalc.routes[i]?.routeSubtotal ?? 0)}
              </span>
            </div>
          ))}
        </div>

        <div className="my-4 border-t border-gray-100" />

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Hauling</span>
            <span>{formatCurrency(quoteCalc.haulSubtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Material</span>
            <span>{formatCurrency(quoteCalc.materialSubtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Tax on material ({quote.taxRate}%)</span>
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
            <span>Broker income ({brokerFeePercent}% of haul buy)</span>
            <span className="text-green-700">{formatCurrency(haulBrokerIncome)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Hauling GP</span>
            <span className={haulingGP >= 0 ? "text-green-700" : "text-red-600"}>
              {formatCurrency(haulingGP)}
            </span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Material GP</span>
            <span className={materialGP >= 0 ? "text-green-700" : "text-red-600"}>
              {formatCurrency(materialGP)}
            </span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900">
            <span>Total GP</span>
            <span>{formatCurrency(quoteCalc.totalGP)}</span>
          </div>
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
