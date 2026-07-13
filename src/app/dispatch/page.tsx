"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Truck } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { useActiveOffice } from "@/components/ActiveOfficeProvider";
import { formatDate } from "@/lib/utils";
import {
  activeOrdersForDispatch,
  assignDispatch,
  carriersForOffice,
  dispatchesForDate,
  getCarrier,
} from "@/lib/dispatch";
import { recordDeliveryTicket } from "@/lib/delivery-tickets";
import { resolveCurrentUser } from "@/lib/current-user";
import { PageHeader, PageToolbar } from "@/components/layout";
import { Button } from "@/components/ui/button";

export default function DispatchPage() {
  const { db, save } = useDb();
  const { officeId } = useActiveOffice();
  const user = resolveCurrentUser(db);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigning, setAssigning] = useState<string | null>(null);
  const [truckLabel, setTruckLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const orders = useMemo(
    () => activeOrdersForDispatch(db, officeId, date),
    [db, officeId, date]
  );
  const carriers = useMemo(() => carriersForOffice(db, officeId), [db, officeId]);
  const dayDispatches = useMemo(() => dispatchesForDate(db, date), [db, date]);

  async function handleAssign(orderId: string, orderLineId: string, carrierId: string) {
    setBusy(true);
    try {
      const { db: next } = assignDispatch(db, orderId, orderLineId, carrierId, {
        truckLabel: truckLabel.trim() || undefined,
        scheduledDate: date,
        userId: user?.id,
      });
      await save(next);
      setAssigning(null);
      setTruckLabel("");
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordTicket(dispatchId: string) {
    setBusy(true);
    try {
      const { db: next } = recordDeliveryTicket(db, {
        dispatchId,
        lineType: "delivery",
        qty: 1,
      });
      await save(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={Truck}
        title="Dispatch"
        description="Assign carriers and trucks to order routes"
      />

      <PageToolbar>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-md border border-gray-200 px-3"
          />
        </label>
        <span className="text-sm text-gray-400">
          {dayDispatches.length} assignment{dayDispatches.length === 1 ? "" : "s"} today
        </span>
      </PageToolbar>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Orders</h2>
            <p className="text-xs text-gray-500">Pending and active orders</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
            {orders.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No orders for this date.</p>
            )}
            {orders.map((order) => (
              <div key={order.id} className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium text-[#0f6b4f] hover:underline"
                    >
                      {order.number}
                    </Link>
                    <p className="text-sm text-gray-600">{order.jobName}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">
                    {order.status}
                  </span>
                </div>
                <ul className="space-y-2">
                  {order.lines.map((line) => {
                    const assigned = dayDispatches.filter(
                      (d) => d.orderLineId === line.id && d.orderId === order.id
                    );
                    const key = `${order.id}:${line.id}`;
                    return (
                      <li
                        key={line.id}
                        className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 text-sm"
                      >
                        <p className="font-medium text-gray-800">
                          {line.pickupAddress} → {line.dropoffAddress}
                        </p>
                        {assigned.length > 0 ? (
                          <ul className="mt-2 space-y-1 text-xs text-gray-600">
                            {assigned.map((d) => {
                              const carrier = getCarrier(db, d.carrierId);
                              return (
                                <li key={d.id} className="space-y-1">
                                  <span>
                                    {carrier?.name ?? "Carrier"}
                                    {d.truckLabel ? ` · ${d.truckLabel}` : ""}
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px]"
                                      disabled={busy}
                                      onClick={() => handleRecordTicket(d.id)}
                                    >
                                      + Delivery ticket
                                    </Button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-gray-400">Not assigned</p>
                        )}
                        {assigning === key ? (
                          <div className="mt-2 space-y-2">
                            <input
                              placeholder="Truck label (optional)"
                              value={truckLabel}
                              onChange={(e) => setTruckLabel(e.target.value)}
                              className="h-8 w-full rounded border border-gray-200 px-2 text-xs"
                            />
                            <div className="flex flex-wrap gap-1">
                              {carriers.map((c) => (
                                <Button
                                  key={c.id}
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  className="h-7 text-xs"
                                  onClick={() => handleAssign(order.id, line.id, c.id)}
                                >
                                  {c.name}
                                </Button>
                              ))}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setAssigning(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 text-xs"
                            onClick={() => setAssigning(key)}
                          >
                            Assign truck
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Fleet / Carriers</h2>
            <p className="text-xs text-gray-500">Available haulers for {formatDate(date)}</p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 max-h-[70vh] overflow-y-auto">
            {carriers.length === 0 && (
              <p className="col-span-2 py-8 text-center text-sm text-gray-400">
                No carriers.{" "}
                <Link href="/carriers" className="text-[#0f6b4f] underline">
                  Add carriers
                </Link>
              </p>
            )}
            {carriers.map((carrier) => {
              const count = dayDispatches.filter((d) => d.carrierId === carrier.id).length;
              return (
                <div
                  key={carrier.id}
                  className="rounded-lg border border-gray-100 p-3 text-sm"
                >
                  <p className="font-medium text-gray-900">{carrier.name}</p>
                  <p className="text-xs text-gray-500">{carrier.phone || carrier.email || "—"}</p>
                  <p className="mt-2 text-xs text-[#0f6b4f]">
                    {count} dispatch{count === 1 ? "" : "es"} today
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
