"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { ClipboardList, Truck, Ticket } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  cancelOrder,
  completeOrder,
  getOrder,
  orderTotalQuoted,
} from "@/lib/orders";
import { orderStatusLabel } from "@/lib/order-status";
import { dispatchesForOrder, getCarrier } from "@/lib/dispatch";
import { approvedTicketsForOrder, ticketsForOrder } from "@/lib/delivery-tickets";
import { tripsForOrder } from "@/lib/trips";
import { buildOrderReconciliation } from "@/lib/order-reconciliation";
import { resolveCurrentUser } from "@/lib/current-user";
import { DetailBreadcrumb, DetailHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  active: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
  invoiced: "bg-purple-100 text-purple-800",
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, save } = useDb();
  const user = resolveCurrentUser(db);

  const order = getOrder(db, id);
  const reconciliation = order ? buildOrderReconciliation(db, order.id) : null;
  const dispatches = order ? dispatchesForOrder(db, order.id) : [];
  const trips = order ? tripsForOrder(db, order.id) : [];
  const tickets = order ? ticketsForOrder(db, order.id) : [];

  const project = order ? db.projects.find((p) => p.id === order.projectId) : undefined;
  const quote = order ? db.quotes.find((q) => q.id === order.quoteId) : undefined;
  const contractor = order?.contractorId
    ? db.contractors.find((c) => c.id === order.contractorId)
    : undefined;

  const orderInvoices = db.customerInvoices.filter((inv) => inv.orderId === id);
  const orderSettlements = db.carrierSettlements.filter((s) => s.orderId === id);
  const orderVendorSettlements = db.vendorSettlements.filter((s) => s.orderId === id);

  const quotedTotal = order ? orderTotalQuoted(order) : 0;
  const deliveredTotal = reconciliation?.deliveredArTotal ?? 0;
  const totalGp = useMemo(
    () => reconciliation?.routeRows.reduce((s, r) => s + r.totalGp, 0) ?? 0,
    [reconciliation]
  );

  if (!order) {
    return (
      <div className="p-8 text-gray-400">
        Order not found.{" "}
        <Link href="/orders" className="text-[#0f6b4f] underline">
          Back to orders
        </Link>
      </div>
    );
  }

  const o = order;

  async function handleComplete() {
    await save(completeOrder(db, o.id, user?.id));
  }

  async function handleCancel() {
    await save(cancelOrder(db, o.id, user?.id));
  }

  const canComplete = o.status === "active" || o.status === "pending";
  const canCancel = o.status !== "cancelled" && o.status !== "invoiced";

  return (
    <div className="p-8">
      <DetailBreadcrumb
        items={[
          { label: "Orders", href: "/orders" },
          { label: order.number },
        ]}
      />
      <DetailHeader
        backHref="/orders"
        icon={ClipboardList}
        title={order.number}
        description={order.jobName}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status] ?? STATUS_STYLES.pending}`}
          >
            {orderStatusLabel(order.status)}
          </span>
          {canComplete && (
            <Button variant="outline" size="sm" onClick={handleComplete}>
              Complete
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>
      </DetailHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/dispatch">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Truck className="h-4 w-4" />
            View Dispatch
          </Button>
        </Link>
        <Link href="/tickets">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Ticket className="h-4 w-4" />
            Open in Tickets Inbox
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              1 · Contractor
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Company</dt>
                <dd className="font-medium">{contractor?.company ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Project</dt>
                <dd>
                  {project ? (
                    <Link href={`/projects/${project.id}`} className="text-[#0f6b4f] hover:underline">
                      {project.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Quote</dt>
                <dd>
                  {quote ? (
                    <Link href={`/quotes/${quote.id}`} className="text-[#0f6b4f] hover:underline">
                      {quote.number}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              2 · Job info
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Job name</dt>
                <dd className="font-medium">{order.jobName}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Tax exempt</dt>
                <dd>{order.taxExempt ? `Yes${order.taxExemptNumber ? ` (${order.taxExemptNumber})` : ""}` : "No"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Tax rate</dt>
                <dd>{order.taxRate}%</dd>
              </div>
              <div>
                <dt className="text-gray-500">Scheduled</dt>
                <dd>{order.scheduledAt ? formatDate(order.scheduledAt) : "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              3 · Routes
            </h2>
            <div className="space-y-3">
              {order.lines.map((line, i) => (
                <div key={line.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 text-sm">
                  <p className="font-medium text-gray-900">
                    Route {i + 1}: {line.pickupAddress} → {line.dropoffAddress}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs text-gray-600">
                    <p>
                      Haul: {formatCurrency(line.haulSellRate)}/{line.haulUnit ?? "TN"} sell ·{" "}
                      {formatCurrency(line.haulBuyRate)} buy · {line.haulQtyQuoted} quoted
                    </p>
                    <p>
                      Material: {formatCurrency(line.materialSellRate)}/{line.materialUnit ?? "TN"} sell ·{" "}
                      {formatCurrency(line.materialBuyRate)} buy · {line.materialQtyQuoted} quoted
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              4 · Trip history
            </h2>
            {trips.length === 0 && dispatches.length === 0 ? (
              <p className="text-sm text-gray-400">No trips yet. Assign dispatch to create trips.</p>
            ) : (
              <ul className="divide-y divide-gray-50 text-sm">
                {trips.map((trip) => {
                  const carrier = getCarrier(db, trip.carrierId);
                  const tripTickets = tickets.filter((t) => t.tripId === trip.id);
                  return (
                    <li key={trip.id} className="py-3">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{trip.number}</span>
                        <span className="capitalize text-gray-500">{trip.status}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {carrier?.name ?? "Carrier"}
                        {trip.truckLabel ? ` · ${trip.truckLabel}` : ""}
                        {trip.scheduledDate ? ` · ${formatDate(trip.scheduledDate)}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {tripTickets.length} ticket{tripTickets.length === 1 ? "" : "s"} ·{" "}
                        {tripTickets.filter((t) => t.status === "approved").length} approved
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              5 · Billing summary
            </h2>
            <p className="mb-3 text-xs text-gray-400">
              Realized GP uses delivered quantities. Broker fee applied to haul buy on carrier settlements.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="border-b border-gray-100 text-left text-gray-500">
                  <tr>
                    <th className="pb-2 pr-2 font-medium">Route</th>
                    <th className="pb-2 pr-2 font-medium text-right">Quoted</th>
                    <th className="pb-2 pr-2 font-medium text-right">Delivered</th>
                    <th className="pb-2 pr-2 font-medium text-right">Haul Rev</th>
                    <th className="pb-2 pr-2 font-medium text-right">Mat Rev</th>
                    <th className="pb-2 pr-2 font-medium text-right">Direct</th>
                    <th className="pb-2 pr-2 font-medium text-right">Haul GP</th>
                    <th className="pb-2 pr-2 font-medium text-right">Mat GP</th>
                    <th className="pb-2 font-medium text-right">Total GP</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliation?.routeRows.map((row) => (
                    <tr key={row.orderLineId} className="border-b border-gray-50">
                      <td className="py-2 pr-2 max-w-[140px] truncate">{row.route}</td>
                      <td className="py-2 pr-2 text-right">{row.quotedQty}</td>
                      <td className="py-2 pr-2 text-right">{row.deliveredQty}</td>
                      <td className="py-2 pr-2 text-right">{formatCurrency(row.haulRev)}</td>
                      <td className="py-2 pr-2 text-right">{formatCurrency(row.matRev)}</td>
                      <td className="py-2 pr-2 text-right">{formatCurrency(row.direct)}</td>
                      <td className="py-2 pr-2 text-right">{formatCurrency(row.haulGp)}</td>
                      <td className="py-2 pr-2 text-right">{formatCurrency(row.matGp)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(row.totalGp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <ClipboardList className="h-4 w-4 text-[#0f6b4f]" />
              Summary
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Quoted total</dt>
                <dd className="font-medium">{formatCurrency(quotedTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Delivered AR</dt>
                <dd className="font-medium">{formatCurrency(deliveredTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Realized GP</dt>
                <dd className="font-medium text-[#0f6b4f]">{formatCurrency(totalGp)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Approved tickets</dt>
                <dd>{approvedTicketsForOrder(db, order.id).length}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">History</h2>
            <ul className="space-y-2 text-xs text-gray-600">
              {(order.history ?? []).length === 0 && <li className="text-gray-400">No events yet.</li>}
              {[...(order.history ?? [])].reverse().map((ev) => (
                <li key={ev.id}>
                  <span className="capitalize">{ev.type.replace(/_/g, " ")}</span>
                  <span className="text-gray-400"> · {formatDate(ev.at)}</span>
                  {ev.note && <span className="block text-gray-500">{ev.note}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold text-gray-900">Billing documents</h2>
            <p className="mb-2 text-xs text-gray-500">
              Drafts are created automatically when tickets are approved in the inbox.
            </p>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/billing/invoices" className="text-[#0f6b4f] hover:underline">
                  {orderInvoices.length} invoice{orderInvoices.length === 1 ? "" : "s"}
                </Link>
              </li>
              <li>
                <Link href="/billing/ap?tab=carriers" className="text-[#0f6b4f] hover:underline">
                  {orderSettlements.length} carrier settlement{orderSettlements.length === 1 ? "" : "s"}
                </Link>
              </li>
              <li>
                <Link href="/billing/ap?tab=vendors" className="text-[#0f6b4f] hover:underline">
                  {orderVendorSettlements.length} vendor payable{orderVendorSettlements.length === 1 ? "" : "s"}
                </Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
