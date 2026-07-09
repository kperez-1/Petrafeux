"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ticket } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOrder } from "@/lib/orders";
import { getTicket } from "@/lib/delivery-tickets";
import { getTrip } from "@/lib/trips";
import { getCarrier } from "@/lib/dispatch";
import {
  rejectTicket,
  saveAndApproveTicket,
  saveTicket,
} from "@/lib/billing-on-approve";
import { resolveCurrentUser } from "@/lib/current-user";
import { DetailBreadcrumb, DetailHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TicketReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, save } = useDb();
  const router = useRouter();
  const user = resolveCurrentUser(db);
  const ticket = getTicket(db, id);
  const [paperNumber, setPaperNumber] = useState(ticket?.paperTicketNumber ?? "");
  const [qty, setQty] = useState(String(ticket?.qty ?? 1));
  const [busy, setBusy] = useState(false);

  if (!ticket) {
    return (
      <div className="p-8 text-gray-400">
        Ticket not found.{" "}
        <Link href="/tickets" className="text-[#0f6b4f] underline">
          Back to inbox
        </Link>
      </div>
    );
  }

  const order = getOrder(db, ticket.orderId);
  const trip = ticket.tripId ? getTrip(db, ticket.tripId) : undefined;
  const dispatch = db.dispatches.find((d) => d.id === ticket.dispatchId);
  const carrier = dispatch ? getCarrier(db, dispatch.carrierId) : undefined;
  const orderLine = order?.lines.find((l) => l.id === ticket.orderLineId);
  const contractor = order?.contractorId
    ? db.contractors.find((c) => c.id === order.contractorId)
    : undefined;

  const updates = {
    qty: parseFloat(qty) || ticket.qty,
    paperTicketNumber: paperNumber.trim() || undefined,
  };

  async function persist(nextDb: typeof db) {
    await save(nextDb);
  }

  async function handleSave() {
    setBusy(true);
    try {
      await persist(saveTicket(db, id, updates));
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    setBusy(true);
    try {
      const result = saveAndApproveTicket(db, id, updates, user?.id);
      await persist(result.db);
      router.push("/tickets");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      await persist(rejectTicket(db, id));
      router.push("/tickets");
    } finally {
      setBusy(false);
    }
  }

  const readOnly = ticket.status !== "pending_review";

  return (
    <div className="p-8">
      <DetailBreadcrumb
        items={[
          { label: "Tickets Inbox", href: "/tickets" },
          { label: ticket.number ?? id },
        ]}
      />
      <DetailHeader
        backHref="/tickets"
        icon={Ticket}
        title={ticket.number ?? "Delivery ticket"}
        description={
          readOnly
            ? `Status: ${ticket.status}`
            : "Review quantity and paper ticket number, then approve"
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Ticket image</h2>
          {ticket.ticketImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ticket.ticketImageUrl}
              alt="Delivery ticket"
              className="max-h-96 w-full rounded-lg object-contain bg-gray-50"
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400">
              No photo uploaded
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold text-gray-900">Order</h2>
            {order && (
              <dl className="space-y-2 text-gray-600">
                <div className="flex justify-between gap-2">
                  <dt>Order</dt>
                  <dd>
                    <Link href={`/orders/${order.id}`} className="text-[#0f6b4f] hover:underline">
                      {order.number}
                    </Link>
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Job</dt>
                  <dd className="text-right">{order.jobName}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Contractor</dt>
                  <dd className="text-right">{contractor?.company ?? "—"}</dd>
                </div>
                {trip && (
                  <div className="flex justify-between gap-2">
                    <dt>Trip</dt>
                    <dd>{trip.number}</dd>
                  </div>
                )}
                {carrier && (
                  <div className="flex justify-between gap-2">
                    <dt>Carrier</dt>
                    <dd>{carrier.name}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold text-gray-900">Ticket details</h2>
            <dl className="mb-4 space-y-2 text-gray-600">
              <div className="flex justify-between gap-2">
                <dt>Type</dt>
                <dd className="capitalize">{ticket.lineType}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Delivered</dt>
                <dd>{formatDate(ticket.deliveredAt)}</dd>
              </div>
              {orderLine && (
                <div className="flex justify-between gap-2">
                  <dt>Route</dt>
                  <dd className="max-w-[180px] text-right text-xs">
                    {orderLine.pickupAddress} → {orderLine.dropoffAddress}
                  </dd>
                </div>
              )}
              {ticket.driverSellRate != null && (
                <div className="flex justify-between gap-2">
                  <dt>Driver sell rate</dt>
                  <dd>{formatCurrency(ticket.driverSellRate)}</dd>
                </div>
              )}
            </dl>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-gray-500">
                Paper ticket #
                <Input
                  value={paperNumber}
                  onChange={(e) => setPaperNumber(e.target.value)}
                  disabled={readOnly}
                  className="mt-1"
                />
              </label>
              <label className="block text-xs font-medium text-gray-500">
                Quantity ({ticket.unit})
                <Input
                  type="number"
                  step="0.01"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  disabled={readOnly}
                  className="mt-1"
                />
              </label>
            </div>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={handleReject}>
                Reject
              </Button>
              <Button variant="outline" disabled={busy} onClick={handleSave}>
                Save
              </Button>
              <Button
                disabled={busy}
                className="bg-[#0f6b4f] hover:bg-[#0d5a42]"
                onClick={handleApprove}
              >
                Save &amp; Approve
              </Button>
            </div>
          )}

          {readOnly && ticket.status === "approved" && (
            <p className="text-xs text-gray-500">
              Approved tickets auto-create draft invoice and AP documents.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
