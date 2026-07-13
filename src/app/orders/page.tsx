"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { useActiveOffice } from "@/components/ActiveOfficeProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { allOrders, orderTotalQuoted } from "@/lib/orders";
import { orderStatusLabel } from "@/lib/order-status";
import { PageHeader, PageToolbar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  active: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
  invoiced: "bg-purple-100 text-purple-800",
};

export default function OrdersPage() {
  const { db } = useDb();
  const { officeId } = useActiveOffice();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedQuoteId, setSelectedQuoteId] = useState("");

  const orders = useMemo(() => {
    return allOrders(db, officeId)
      .filter((o) => {
        const q = search.toLowerCase();
        const quote = db.quotes.find((x) => x.id === o.quoteId);
        const contractor = db.contractors.find((c) => c.id === o.contractorId);
        return `${o.number} ${o.jobName} ${quote?.number ?? ""} ${contractor?.company ?? ""}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [db, officeId, search]);

  const creatableQuotes = useMemo(
    () =>
      db.quotes.filter(
        (q) =>
          q.status === "approved" &&
          (!officeId ||
            !db.projects.find((p) => p.id === q.projectId)?.officeId ||
            db.projects.find((p) => p.id === q.projectId)?.officeId === officeId)
      ),
    [db, officeId]
  );

  function handleCreateOrder() {
    if (!selectedQuoteId) return;
    router.push(`/quotes/${selectedQuoteId}/create-order`);
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={ClipboardList}
        title="Orders"
        description="Global order list — create from approved quotes"
      />

      <PageToolbar>
        <Input
          placeholder="Search orders…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={selectedQuoteId}
            onChange={(e) => setSelectedQuoteId(e.target.value)}
          >
            <option value="">Create from quote…</option>
            {creatableQuotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.number} — {q.jobName}
              </option>
            ))}
          </select>
          <Button
            disabled={!selectedQuoteId}
            onClick={handleCreateOrder}
            className="gap-1.5 bg-[#0f6b4f] hover:bg-[#0d5a42]"
          >
            <Plus className="h-4 w-4" />
            Create order
          </Button>
        </div>
      </PageToolbar>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">No.</th>
              <th className="px-4 py-3 font-medium">Quote</th>
              <th className="px-4 py-3 font-medium">Contractor</th>
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Scheduled</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No orders yet. Create one from an approved quote.
                </td>
              </tr>
            )}
            {orders.map((order) => {
              const quote = db.quotes.find((q) => q.id === order.quoteId);
              const contractor = db.contractors.find((c) => c.id === order.contractorId);
              return (
                <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="font-medium text-[#0f6b4f] hover:underline">
                      {order.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{quote?.number ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{contractor?.company ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-900">{order.jobName}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(orderTotalQuoted(order))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status] ?? STATUS_STYLES.pending}`}
                    >
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {order.scheduledAt ? formatDate(order.scheduledAt) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
