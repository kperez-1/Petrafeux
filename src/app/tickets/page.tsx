"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { useActiveOffice } from "@/components/ActiveOfficeProvider";
import {
  ordersWithPendingTickets,
  pendingTickets,
  ticketsGroupedByTrip,
} from "@/lib/delivery-tickets";
import { getTrip } from "@/lib/trips";
import { deliveryTicketLineLabel } from "@/lib/delivery-ticket-billing";
import { PageHeader, PageToolbar } from "@/components/layout";
import { Input } from "@/components/ui/input";

export default function TicketsInboxPage() {
  const { db } = useDb();
  const { officeId } = useActiveOffice();
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const pendingOrders = useMemo(
    () =>
      ordersWithPendingTickets(db, officeId).filter((o) =>
        `${o.number} ${o.jobName}`.toLowerCase().includes(search.toLowerCase())
      ),
    [db, officeId, search]
  );

  const activeOrderId = selectedOrderId ?? pendingOrders[0]?.id ?? null;
  const activeOrder = activeOrderId ? db.orders.find((o) => o.id === activeOrderId) : undefined;
  const groups = activeOrderId ? ticketsGroupedByTrip(db, activeOrderId) : [];
  const pendingCount = pendingTickets(db, officeId).length;

  return (
    <div className="p-8">
      <PageHeader
        icon={Ticket}
        title="Tickets Inbox"
        description={`${pendingCount} ticket${pendingCount === 1 ? "" : "s"} pending review`}
      />

      <PageToolbar>
        <Input
          placeholder="Filter orders…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </PageToolbar>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
            Pending orders
          </div>
          <ul className="max-h-[70vh] overflow-y-auto divide-y divide-gray-50">
            {pendingOrders.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-gray-400">Inbox clear.</li>
            )}
            {pendingOrders.map((order) => {
              const count = pendingTickets(db, officeId).filter((t) => t.orderId === order.id)
                .length;
              const active = order.id === activeOrderId;
              return (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`w-full px-4 py-3 text-left text-sm transition ${
                      active ? "bg-[#0f6b4f]/5 border-l-2 border-[#0f6b4f]" : "hover:bg-gray-50"
                    }`}
                  >
                    <p className="font-medium text-gray-900">{order.number}</p>
                    <p className="truncate text-xs text-gray-500">{order.jobName}</p>
                    <p className="mt-1 text-xs text-[#0f6b4f]">{count} pending</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="rounded-xl border border-gray-200 bg-white">
          {!activeOrder ? (
            <p className="px-4 py-12 text-center text-sm text-gray-400">
              Select an order to review tickets.
            </p>
          ) : (
            <>
              <div className="border-b border-gray-100 px-4 py-3">
                <Link
                  href={`/orders/${activeOrder.id}`}
                  className="font-semibold text-[#0f6b4f] hover:underline"
                >
                  {activeOrder.number}
                </Link>
                <p className="text-sm text-gray-500">{activeOrder.jobName}</p>
              </div>
              <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
                {groups.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">
                    No pending tickets for this order.
                  </p>
                )}
                {groups.map(({ key, tickets }) => {
                  const trip = db.trips.find((t) => t.id === key) ?? getTrip(db, key);
                  const tripLabel = trip?.number ?? `Dispatch ${key.slice(0, 8)}`;
                  return (
                    <div key={key} className="p-4">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Trip {tripLabel}
                        {trip?.truckLabel ? ` · ${trip.truckLabel}` : ""}
                      </h3>
                      <ul className="space-y-2">
                        {tickets.map((ticket) => (
                          <li key={ticket.id}>
                            <Link
                              href={`/tickets/${ticket.id}`}
                              className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm hover:border-[#0f6b4f]/30 hover:bg-gray-50"
                            >
                              <span>
                                <span className="font-medium text-gray-900">
                                  {ticket.number ?? ticket.id.slice(0, 8)}
                                </span>
                                <span className="ml-2 text-gray-500">
                                  {deliveryTicketLineLabel(ticket.lineType)}
                                </span>
                              </span>
                              <span className="text-gray-600">
                                {ticket.qty} {ticket.unit}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
