"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Wallet, X } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { useActiveOffice } from "@/components/ActiveOfficeProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOrder } from "@/lib/orders";
import { getCarrier } from "@/lib/dispatch";
import { getVendor } from "@/lib/vendor-payables";
import {
  apBalanceSummary,
  apDetailHref,
  apRowsForParty,
  ApKindFilter,
  ApLedgerRow,
  LedgerBucket,
} from "@/lib/billing-ledger";
import { approveCarrierSettlement, approveVendorSettlement } from "@/lib/billing-approve";
import { agingBucketApOpen, summarizeAging } from "@/lib/billing-aging";
import { AgingBucket } from "@/lib/types";
import { PageHeader, PageToolbar } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AgingSummaryStrip } from "@/components/billing/AgingSummaryStrip";
import { RecordPaymentSheet } from "@/components/billing/RecordPaymentSheet";
import { ManualVendorBillSheet } from "@/components/billing/ManualVendorBillSheet";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  approved: "bg-yellow-100 text-yellow-800 border-yellow-200",
  paid: "bg-green-100 text-green-800 border-green-200",
  disputed: "bg-red-100 text-red-800 border-red-200",
};

const BUCKETS: { id: LedgerBucket; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "paid", label: "Paid" },
  { id: "all", label: "All" },
];

const TABS: { id: ApKindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "carrier", label: "Carriers" },
  { id: "vendor", label: "Vendors" },
];

const KIND_LABELS: Record<string, string> = {
  carrier: "Carrier",
  material: "Material vendor",
  disposal: "Disposal vendor",
};

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
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Open payables</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(openTotal)}</p>
        <p className="text-xs text-gray-500">{openCount} bill{openCount === 1 ? "" : "s"}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Paid total</p>
        <p className="mt-1 text-2xl font-semibold text-[#0f6b4f]">{formatCurrency(paidTotal)}</p>
        <p className="text-xs text-gray-500">{paidCount} bill{paidCount === 1 ? "" : "s"}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Outstanding</p>
        <p className="mt-1 text-2xl font-semibold text-amber-700">{openCount}</p>
        <p className="text-xs text-gray-500">Awaiting payment</p>
      </div>
    </div>
  );
}

export default function AccountsPayablePage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading payables…</div>}>
      <AccountsPayablePageContent />
    </Suspense>
  );
}

function AccountsPayablePageContent() {
  const { db, save } = useDb();
  const { officeId } = useActiveOffice();
  const router = useRouter();
  const searchParams = useSearchParams();

  const bucket = (searchParams.get("bucket") as LedgerBucket) || "open";
  const tab = (searchParams.get("tab") as ApKindFilter) || "all";
  const vendorId = searchParams.get("vendorId") ?? undefined;
  const carrierId = searchParams.get("carrierId") ?? undefined;
  const search = searchParams.get("q") ?? "";
  const disputedOnly = searchParams.get("disputed") === "1";
  const overdueOnly = searchParams.get("overdue") === "1";
  const agingParam = searchParams.get("aging") as AgingBucket | null;
  const agingBucket =
    agingParam && ["current", "1_30", "31_60", "61_90", "90_plus"].includes(agingParam)
      ? agingParam
      : undefined;

  const [payTarget, setPayTarget] = useState<{
    id: string;
    kind: "carrier" | "vendor";
    amount: number;
  } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const partyFilter = useMemo(() => {
    if (vendorId) {
      const vendor = getVendor(db, vendorId);
      return { label: vendor?.name ?? "Vendor", clearKeys: ["vendorId"] as const };
    }
    if (carrierId) {
      const carrier = getCarrier(db, carrierId);
      return { label: carrier?.name ?? "Carrier", clearKeys: ["carrierId"] as const };
    }
    return null;
  }, [db, vendorId, carrierId]);

  const allForSummary = useMemo(
    () =>
      apRowsForParty(db, {
        officeId,
        vendorId,
        carrierId,
        kind: tab,
        bucket: "all",
      }),
    [db, officeId, vendorId, carrierId, tab]
  );

  const summary = useMemo(() => apBalanceSummary(allForSummary), [allForSummary]);

  const rows = useMemo(() => {
    return apRowsForParty(db, {
      officeId,
      vendorId,
      carrierId,
      kind: tab,
      bucket,
      disputedOnly,
      overdueOnly,
      agingBucket,
    }).filter((row) => {
      const order = row.orderId ? getOrder(db, row.orderId) : undefined;
      const hay = `${row.number} ${row.partyName} ${order?.jobName ?? ""} ${row.status} ${row.vendorInvoiceNumber ?? ""}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [db, officeId, vendorId, carrierId, tab, bucket, search, disputedOnly, overdueOnly, agingBucket]);

  const approvedRows = useMemo(
    () =>
      apRowsForParty(db, {
        officeId,
        vendorId,
        carrierId,
        kind: tab,
        bucket: "open",
      }).filter((r) => r.status === "approved"),
    [db, officeId, vendorId, carrierId, tab]
  );

  const apAgingSummary = useMemo(
    () =>
      summarizeAging(
        approvedRows,
        (row) => agingBucketApOpen(row.status, row.dueDate),
        (row) => row.amount
      ),
    [approvedRows]
  );

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`/billing/ap?${params.toString()}`);
  }

  function setParam(key: string, value: string | null) {
    setParams({ [key]: value });
  }

  function setBucket(next: LedgerBucket) {
    setParam("bucket", next === "open" ? null : next);
  }

  function setTab(next: ApKindFilter) {
    setParam("tab", next === "all" ? null : next);
  }

  async function markApproved(row: ApLedgerRow) {
    if (row.kind === "carrier") {
      await save(approveCarrierSettlement(db, row.id, db.meta.currentUserId));
    } else {
      await save(approveVendorSettlement(db, row.id, db.meta.currentUserId));
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={Wallet}
        title="Accounts Payable"
        description="Carrier settlements and vendor payables — open and paid bills you owe"
      >
        <Button size="sm" variant="outline" onClick={() => setManualOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Enter vendor invoice
        </Button>
      </PageHeader>

      <KpiStrip {...summary} />

      <AgingSummaryStrip
        rows={apAgingSummary}
        selected={agingBucket ?? "all"}
        onSelect={(b) => {
          if (b === "all") {
            setParams({ aging: null, overdue: null });
          } else {
            setParams({ aging: b, overdue: null });
          }
        }}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

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
        {(tab === "all" || tab === "vendor") && (
          <button
            type="button"
            onClick={() => setParam("disputed", disputedOnly ? null : "1")}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              disputedOnly
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Disputed
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setParams({
              overdue: overdueOnly ? null : "1",
              aging: null,
            });
          }}
          className={`rounded-full px-3 py-1 text-sm font-medium transition ${
            overdueOnly
              ? "bg-red-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Overdue
        </button>
        {partyFilter && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#0f6b4f]/30 bg-[#0f6b4f]/5 px-3 py-1 text-xs text-[#0f6b4f]">
            Showing: {partyFilter.label}
            <button
              type="button"
              aria-label="Clear party filter"
              onClick={() => {
                for (const key of partyFilter.clearKeys) setParam(key, null);
              }}
              className="rounded p-0.5 hover:bg-[#0f6b4f]/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      <PageToolbar>
        <Input
          placeholder="Search payables…"
          value={search}
          onChange={(e) => setParam("q", e.target.value || null)}
          className="max-w-xs"
        />
      </PageToolbar>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-medium">Document</th>
              <th className="px-4 py-3 font-medium">Payee</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium text-right">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Issued</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  No {bucket === "all" ? "" : bucket} payables
                  {partyFilter ? ` for ${partyFilter.label}` : ""}.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const order = row.orderId ? getOrder(db, row.orderId) : undefined;
              const typeLabel =
                row.kind === "carrier"
                  ? KIND_LABELS.carrier
                  : KIND_LABELS[row.payeeKind ?? "material"];
              return (
                <tr key={`${row.kind}-${row.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={apDetailHref(row.id, row.kind)}
                      className="text-[#0f6b4f] hover:underline"
                    >
                      {row.number}
                    </Link>
                    {row.vendorInvoiceNumber && (
                      <div className="mt-0.5 text-[10px] text-gray-400">
                        Vendor #{row.vendorInvoiceNumber}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.partyName}</td>
                  <td className="px-4 py-3 text-gray-600">{typeLabel}</td>
                  <td className="px-4 py-3">
                    {order ? (
                      <Link href={`/orders/${order.id}`} className="text-[#0f6b4f] hover:underline">
                        {order.number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.amount)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[row.status] ?? STATUS_STYLES.draft}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {row.dueDate ? formatDate(row.dueDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(row.issuedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {row.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => markApproved(row)}>
                          Approve
                        </Button>
                      )}
                      {row.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPayTarget({ id: row.id, kind: row.kind, amount: row.amount })
                          }
                        >
                          Record payment
                        </Button>
                      )}
                      {row.status === "disputed" && (
                        <span className="text-xs text-red-600">Resolve dispute to pay</span>
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
          documentKind={
            payTarget.kind === "carrier" ? "carrier_settlement" : "vendor_settlement"
          }
          documentId={payTarget.id}
          defaultAmount={payTarget.amount}
        />
      )}
      <ManualVendorBillSheet
        open={manualOpen}
        onOpenChange={setManualOpen}
        onCreated={(id) => router.push(apDetailHref(id, "vendor"))}
      />
    </div>
  );
}
