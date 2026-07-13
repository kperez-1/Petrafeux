"use client";

import { Suspense, use, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Wallet } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOrder } from "@/lib/orders";
import { getCarrier } from "@/lib/dispatch";
import { formatVendorSettlementTitle } from "@/lib/billing-ap-vendor";
import {
  ApRowKind,
  groupLinesByDeliveryTicket,
  resolveApDocument,
} from "@/lib/billing-ledger";
import { approveCarrierSettlement, approveVendorSettlement } from "@/lib/billing-approve";
import {
  addCarrierSettlementNote,
  addVendorSettlementNote,
} from "@/lib/billing-notes";
import {
  getActivitiesForCarrierSettlement,
  getActivitiesForVendorSettlement,
} from "@/lib/activities";
import { DetailBreadcrumb, DetailHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  CarrierSettlementLinesTable,
  VendorSettlementLinesTable,
} from "@/components/billing/SettlementLinesTable";
import { ActivitiesPanel } from "@/components/activities/ActivitiesPanel";
import { BillingNotesPanel } from "@/components/billing/BillingNotesPanel";
import { VendorDisputeCard } from "@/components/billing/VendorDisputeSheet";
import { RecordPaymentSheet } from "@/components/billing/RecordPaymentSheet";
import { ThreeWayMatchPanel } from "@/components/billing/ThreeWayMatchPanel";
import {
  threeWayMatchForCarrierLines,
  threeWayMatchForVendorLines,
} from "@/lib/billing-three-way";
import { isOverdueAp } from "@/lib/billing-aging";
import { VendorSettlement } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  approved: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  disputed: "bg-red-100 text-red-800",
};

export default function ApDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading payable…</div>}>
      <ApDetailPageContent params={params} />
    </Suspense>
  );
}

function ApDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const kindHint = (searchParams.get("kind") as ApRowKind) || undefined;
  const { db, save } = useDb();
  const [payOpen, setPayOpen] = useState(false);

  const doc = resolveApDocument(db, id, kindHint);
  const settlement = doc?.settlement;
  const isCarrier = doc?.kind === "carrier";

  const carrierLineGroups = useMemo(() => {
    if (!doc || doc.kind !== "carrier") return [];
    return groupLinesByDeliveryTicket(db, doc.settlement.lines, (line) => line.netPay);
  }, [db, doc]);

  const vendorLineGroups = useMemo(() => {
    if (!doc || doc.kind !== "vendor") return [];
    return groupLinesByDeliveryTicket(db, doc.settlement.lines, (line) => line.amount);
  }, [db, doc]);

  const activities = useMemo(() => {
    if (!doc) return [];
    if (doc.kind === "carrier") {
      return getActivitiesForCarrierSettlement(db, doc.settlement.id);
    }
    return getActivitiesForVendorSettlement(db, doc.settlement.id);
  }, [db, doc]);

  const activityDefaults = useMemo(() => {
    if (!doc) return undefined;
    const order = doc.settlement.orderId ? getOrder(db, doc.settlement.orderId) : undefined;
    if (doc.kind === "carrier") {
      return { carrierSettlementId: doc.settlement.id, projectId: order?.projectId };
    }
    return { vendorSettlementId: doc.settlement.id, projectId: order?.projectId };
  }, [db, doc]);

  const threeWayRows = useMemo(() => {
    if (!doc) return [];
    if (doc.kind === "carrier") {
      return threeWayMatchForCarrierLines(db, doc.settlement.orderId, doc.settlement.lines);
    }
    return threeWayMatchForVendorLines(
      db,
      doc.settlement.orderId,
      doc.settlement.lines
    );
  }, [db, doc]);

  if (!doc || !settlement) {
    return (
      <div className="p-8 text-gray-400">
        Payable not found.{" "}
        <Link href="/billing/ap" className="text-[#0f6b4f] underline">
          Back to Accounts Payable
        </Link>
      </div>
    );
  }

  const apDoc = doc;
  const apSettlement = settlement;

  const order = apSettlement.orderId ? getOrder(db, apSettlement.orderId) : undefined;

  const approverName = apSettlement.approvedByUserId
    ? db.users.find((u) => u.id === apSettlement.approvedByUserId)?.name
    : undefined;

  const payeeName =
    apDoc.kind === "carrier"
      ? getCarrier(db, apDoc.settlement.carrierId)?.name ?? "Carrier"
      : formatVendorSettlementTitle(
          db,
          apDoc.settlement.vendorId,
          apDoc.settlement.payeeKind
        );

  const typeLabel =
    apDoc.kind === "carrier"
      ? "Motor carrier settlement"
      : apDoc.settlement.payeeKind === "disposal"
        ? "Disposal vendor payable"
        : "Material vendor payable";

  async function markApproved() {
    if (apDoc.kind === "carrier") {
      await save(approveCarrierSettlement(db, apSettlement.id, db.meta.currentUserId));
    } else {
      await save(approveVendorSettlement(db, apSettlement.id, db.meta.currentUserId));
    }
  }

  async function handleAddNote(body: string) {
    if (apDoc.kind === "carrier") {
      await save(addCarrierSettlementNote(db, apSettlement.id, body));
    } else {
      await save(addVendorSettlementNote(db, apSettlement.id, body));
    }
  }

  return (
    <div className="p-8">
      <DetailBreadcrumb
        items={[
          { label: "Accounts Payable", href: "/billing/ap" },
          { label: settlement.number },
        ]}
      />
      <DetailHeader
        backHref="/billing/ap"
        icon={Wallet}
        title={settlement.number}
        description={`${typeLabel} · Issued ${formatDate(settlement.issuedAt)}${settlement.dueDate ? ` · Due ${formatDate(settlement.dueDate)}` : ""}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[settlement.status] ?? STATUS_STYLES.draft}`}
          >
            {settlement.status}
          </span>
          {isOverdueAp(settlement) && (
            <span className="text-xs font-medium text-red-600">Overdue</span>
          )}
          {!isCarrier &&
            (apSettlement as VendorSettlement).source === "manual" && (
            <span className="text-xs text-gray-500">Manual entry</span>
          )}
          {settlement.status === "draft" && (
            <Button size="sm" variant="outline" onClick={markApproved}>
              Approve
            </Button>
          )}
          {apSettlement.status === "approved" && (
            <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
              Record payment
            </Button>
          )}
          {!isCarrier &&
            (settlement.status === "draft" || settlement.status === "approved") && (
              <VendorDisputeCard settlement={settlement as VendorSettlement} />
            )}
        </div>
      </DetailHeader>

      {!isCarrier && settlement.status === "disputed" && (
        <div className="mb-6">
          <VendorDisputeCard settlement={settlement as VendorSettlement} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <ThreeWayMatchPanel rows={threeWayRows} />
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Line items</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="pb-2 pr-2 font-medium">Ticket</th>
                    <th className="pb-2 pr-2 font-medium">Description</th>
                    <th className="pb-2 pr-2 font-medium text-right">Qty</th>
                    <th className="pb-2 pr-2 font-medium text-right">Buy rate</th>
                    {isCarrier && (
                      <>
                        <th className="pb-2 pr-2 font-medium text-right">Gross</th>
                        <th className="pb-2 pr-2 font-medium text-right">Broker</th>
                      </>
                    )}
                    <th className="pb-2 font-medium text-right">
                      {isCarrier ? "Net pay" : "Amount"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isCarrier ? (
                    <CarrierSettlementLinesTable db={db} groups={carrierLineGroups} />
                  ) : (
                    <VendorSettlementLinesTable db={db} groups={vendorLineGroups} />
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold text-gray-900">Payee</h2>
            <p className="font-medium text-gray-900">{payeeName}</p>
            <p className="mt-1 text-xs text-gray-500">{typeLabel}</p>
            {!isCarrier && (apSettlement as VendorSettlement).vendorInvoiceNumber && (
              <p className="mt-2 text-xs text-gray-600">
                Vendor invoice #{(apSettlement as VendorSettlement).vendorInvoiceNumber}
              </p>
            )}
          </div>

          {(settlement.dueDate || approverName) && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
              <h2 className="mb-3 font-semibold text-gray-900">Terms</h2>
              <dl className="space-y-2 text-gray-600">
                {settlement.dueDate && (
                  <div className="flex justify-between gap-2">
                    <dt>Due date</dt>
                    <dd className="font-medium text-gray-900">
                      {formatDate(settlement.dueDate)}
                    </dd>
                  </div>
                )}
                {approverName && (
                  <div className="flex justify-between gap-2">
                    <dt>Approved by</dt>
                    <dd className="text-right font-medium text-gray-900">{approverName}</dd>
                  </div>
                )}
                {apSettlement.approvedAt && (
                  <div className="flex justify-between gap-2">
                    <dt>Approved</dt>
                    <dd>{formatDate(apSettlement.approvedAt)}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {apSettlement.payments && apSettlement.payments.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
              <h2 className="mb-3 font-semibold text-gray-900">Payments</h2>
              <ul className="space-y-2">
                {apSettlement.payments.map((p) => (
                  <li key={p.id} className="text-gray-600">
                    <div className="flex justify-between gap-2">
                      <span>
                        {p.method.toUpperCase()}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(p.amount)}
                      </span>
                    </div>
                    {p.note && <p className="mt-0.5 text-xs text-gray-400">{p.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold text-gray-900">Order</h2>
            <dl className="space-y-2 text-gray-600">
              <div className="flex justify-between gap-2">
                <dt>Job</dt>
                <dd className="text-right font-medium text-gray-900">{order?.jobName ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Order</dt>
                <dd>
                  {order ? (
                    <Link href={`/orders/${order.id}`} className="text-[#0f6b4f] hover:underline">
                      {order.number}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold text-gray-900">Totals</h2>
            {apDoc.kind === "carrier" ? (
              <dl className="space-y-2">
                <div className="flex justify-between text-gray-600">
                  <dt>Subtotal (gross)</dt>
                  <dd>{formatCurrency(apDoc.settlement.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-gray-600">
                  <dt>Broker fee</dt>
                  <dd>{formatCurrency(apDoc.settlement.brokerFee)}</dd>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-900">
                  <dt>Net pay</dt>
                  <dd>{formatCurrency(apDoc.settlement.netPay)}</dd>
                </div>
              </dl>
            ) : (
              <dl className="space-y-2">
                <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-900">
                  <dt>Total payable</dt>
                  <dd>{formatCurrency(apDoc.settlement.netPay)}</dd>
                </div>
              </dl>
            )}
          </div>

          <ActivitiesPanel
            title="Follow-up"
            activities={activities}
            createDefaults={activityDefaults}
          />
          <BillingNotesPanel
            notes={"notes" in apSettlement ? apSettlement.notes : undefined}
            onAddNote={handleAddNote}
          />
        </aside>
      </div>

      <RecordPaymentSheet
        open={payOpen}
        onOpenChange={setPayOpen}
        documentKind={
          apDoc.kind === "carrier" ? "carrier_settlement" : "vendor_settlement"
        }
        documentId={apSettlement.id}
        defaultAmount={apDoc.kind === "carrier" ? apSettlement.netPay : apSettlement.netPay}
      />
    </div>
  );
}
