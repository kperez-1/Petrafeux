"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, MessageSquare, Plus, X } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { useActiveOffice } from "@/components/ActiveOfficeProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOrder } from "@/lib/orders";
import { parseCompanySlug } from "@/lib/contractors";
import {
  arBalanceSummary,
  contractorCompanyName,
  invoicesForParty,
  LedgerBucket,
} from "@/lib/billing-ledger";
import { markInvoiceSent } from "@/lib/billing-approve";
import { agingBucketAr, isOverdueAr, summarizeAging } from "@/lib/billing-aging";
import { AgingBucket } from "@/lib/types";
import { PageHeader, PageToolbar } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InvoicePdfButton } from "@/components/billing/InvoicePdfButton";
import { AgingSummaryStrip } from "@/components/billing/AgingSummaryStrip";
import { RecordPaymentSheet } from "@/components/billing/RecordPaymentSheet";
import { ManualArInvoiceSheet } from "@/components/billing/ManualArInvoiceSheet";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  sent: "bg-yellow-100 text-yellow-800 border-yellow-200",
  paid: "bg-green-100 text-green-800 border-green-200",
  void: "bg-red-100 text-red-700 border-red-200",
};

const BUCKETS: { id: LedgerBucket; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "paid", label: "Paid" },
  { id: "all", label: "All" },
];

function KpiStrip({
  openTotal,
  openCount,
  paidTotal,
  paidCount,
}: {
  openTotal: number;
  openCount: number;
  paidTotal: number;
  paidCount: number;
}) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Open balance</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(openTotal)}</p>
        <p className="text-xs text-gray-500">{openCount} invoice{openCount === 1 ? "" : "s"}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Paid total</p>
        <p className="mt-1 text-2xl font-semibold text-[#0f6b4f]">{formatCurrency(paidTotal)}</p>
        <p className="text-xs text-gray-500">{paidCount} invoice{paidCount === 1 ? "" : "s"}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Outstanding</p>
        <p className="mt-1 text-2xl font-semibold text-amber-700">{openCount}</p>
        <p className="text-xs text-gray-500">Awaiting payment</p>
      </div>
    </div>
  );
}

export default function CustomerInvoicesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading invoices…</div>}>
      <CustomerInvoicesPageContent />
    </Suspense>
  );
}

function CustomerInvoicesPageContent() {
  const { db, save } = useDb();
  const { officeId } = useActiveOffice();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucket = (searchParams.get("bucket") as LedgerBucket) || "open";
  const companySlugParam = searchParams.get("company") ?? undefined;
  const contractorIdParam = searchParams.get("contractorId") ?? undefined;
  const search = searchParams.get("q") ?? "";
  const overdueOnly = searchParams.get("overdue") === "1";
  const agingParam = searchParams.get("aging") as AgingBucket | null;
  const agingBucket =
    agingParam && ["current", "1_30", "31_60", "61_90", "90_plus"].includes(agingParam)
      ? agingParam
      : undefined;

  const [payTarget, setPayTarget] = useState<{ id: string; amount: number } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const companyName = companySlugParam ? parseCompanySlug(companySlugParam) : undefined;

  const openInvoices = useMemo(
    () =>
      invoicesForParty(db, {
        officeId,
        companyName,
        contractorId: contractorIdParam,
        bucket: "open",
      }).filter((inv) => inv.status === "sent"),
    [db, officeId, companyName, contractorIdParam]
  );

  const agingSummary = useMemo(
    () =>
      summarizeAging(openInvoices, agingBucketAr, (inv) => inv.total),
    [openInvoices]
  );

  const allForSummary = useMemo(
    () =>
      invoicesForParty(db, {
        officeId,
        companyName,
        contractorId: contractorIdParam,
        bucket: "all",
      }),
    [db, officeId, companyName, contractorIdParam]
  );

  const summary = useMemo(() => arBalanceSummary(allForSummary), [allForSummary]);

  const invoices = useMemo(() => {
    return invoicesForParty(db, {
      officeId,
      companyName,
      contractorId: contractorIdParam,
      bucket,
      overdueOnly,
      agingBucket,
    }).filter((inv) => {
      const order = inv.orderId ? getOrder(db, inv.orderId) : undefined;
      const contractor = contractorCompanyName(db, inv.contractorId);
      const hay = `${inv.number} ${order?.jobName ?? ""} ${contractor ?? ""} ${inv.status}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [db, officeId, companyName, contractorIdParam, bucket, search, overdueOnly, agingBucket]);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`/billing/invoices?${params.toString()}`);
  }

  function setBucket(next: LedgerBucket) {
    setParam("bucket", next === "open" ? null : next);
  }

  async function markSent(invoiceId: string) {
    await save(markInvoiceSent(db, invoiceId, db.meta.currentUserId));
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={ClipboardList}
        title="Accounts Receivable"
        description="Customer invoices — open and paid bills owed to you"
      >
        <Button size="sm" variant="outline" onClick={() => setManualOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Manual invoice
        </Button>
      </PageHeader>

      <KpiStrip {...summary} />

      <AgingSummaryStrip
        rows={agingSummary}
        selected={agingBucket ?? (overdueOnly ? undefined : "all")}
        onSelect={(b) => {
          if (b === "all") {
            setParam("aging", null);
            setParam("overdue", null);
          } else {
            setParam("aging", b);
            setParam("overdue", null);
          }
        }}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBucket(b.id)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              bucket === b.id
                ? "bg-[#0f6b4f] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setParam("overdue", overdueOnly ? null : "1");
            setParam("aging", null);
          }}
          className={`rounded-full px-3 py-1 text-sm font-medium transition ${
            overdueOnly
              ? "bg-red-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Overdue
        </button>
        {companyName && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#0f6b4f]/30 bg-[#0f6b4f]/5 px-3 py-1 text-xs text-[#0f6b4f]">
            Showing: {companyName}
            <button
              type="button"
              aria-label="Clear company filter"
              onClick={() => setParam("company", null)}
              className="rounded p-0.5 hover:bg-[#0f6b4f]/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      <PageToolbar>
        <Input
          placeholder="Search invoices…"
          value={search}
          onChange={(e) => setParam("q", e.target.value || null)}
          className="max-w-xs"
        />
      </PageToolbar>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Contractor</th>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Issued</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  No {bucket === "all" ? "" : bucket} invoices
                  {companyName ? ` for ${companyName}` : ""}.
                </td>
              </tr>
            )}
            {invoices.map((inv) => {
              const order = inv.orderId ? getOrder(db, inv.orderId) : undefined;
              const contractor = contractorCompanyName(db, inv.contractorId);
              const overdue = isOverdueAr(inv);
              return (
                <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/billing/invoices/${inv.id}`}
                      className="inline-flex items-center gap-1.5 text-[#0f6b4f] hover:underline"
                    >
                      {inv.number}
                      {(inv.notes?.length ?? 0) > 0 && (
                        <MessageSquare
                          className="h-3.5 w-3.5 text-gray-400"
                          aria-label={`${inv.notes!.length} note(s)`}
                        />
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{contractor ?? "—"}</td>
                  <td className="px-4 py-3">
                    {order ? (
                      <Link href={`/orders/${order.id}`} className="text-[#0f6b4f] hover:underline">
                        {order.number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{order?.jobName ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft}`}
                    >
                      {inv.status}
                    </span>
                    {overdue && (
                      <span className="ml-1 text-xs font-medium text-red-600">overdue</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {inv.dueDate ? formatDate(inv.dueDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(inv.issuedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <InvoicePdfButton invoice={inv} />
                      {inv.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => markSent(inv.id)}>
                          Mark sent
                        </Button>
                      )}
                      {inv.status === "sent" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPayTarget({ id: inv.id, amount: inv.total })}
                        >
                          Record payment
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {payTarget && (
        <RecordPaymentSheet
          open={Boolean(payTarget)}
          onOpenChange={(open) => !open && setPayTarget(null)}
          documentKind="ar_invoice"
          documentId={payTarget.id}
          defaultAmount={payTarget.amount}
        />
      )}
      <ManualArInvoiceSheet
        open={manualOpen}
        onOpenChange={setManualOpen}
        onCreated={(id) => router.push(`/billing/invoices/${id}`)}
      />
    </div>
  );
}