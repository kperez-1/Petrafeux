"use client";

import { use, useMemo, Fragment, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { isOverdueAr } from "@/lib/billing-aging";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOrder } from "@/lib/orders";
import {
  contractorCompanyName,
  getCustomerInvoice,
  getTicketForInvoiceLine,
  groupInvoiceLinesByTicket,
} from "@/lib/billing-ledger";
import { markInvoiceSent } from "@/lib/billing-approve";
import { addInvoiceNote } from "@/lib/billing-notes";
import { getActivitiesForInvoice } from "@/lib/activities";
import { unitRateLabel } from "@/lib/types";
import { DetailBreadcrumb, DetailHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { InvoicePdfButton } from "@/components/billing/InvoicePdfButton";
import { ActivitiesPanel } from "@/components/activities/ActivitiesPanel";
import { BillingNotesPanel } from "@/components/billing/BillingNotesPanel";
import { RecordPaymentSheet } from "@/components/billing/RecordPaymentSheet";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  void: "bg-red-100 text-red-700",
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, save } = useDb();
  const [payOpen, setPayOpen] = useState(false);
  const invoice = getCustomerInvoice(db, id);

  const order = invoice?.orderId ? getOrder(db, invoice.orderId) : undefined;
  const project = invoice?.projectId
    ? db.projects.find((p) => p.id === invoice.projectId)
    : undefined;
  const contractor = invoice?.contractorId
    ? db.contractors.find((c) => c.id === invoice.contractorId)
    : undefined;
  const companyName = invoice ? contractorCompanyName(db, invoice.contractorId) : undefined;

  const lineGroups = useMemo(
    () => (invoice ? groupInvoiceLinesByTicket(db, invoice.lines) : []),
    [db, invoice]
  );

  const activities = useMemo(
    () => (invoice ? getActivitiesForInvoice(db, invoice.id) : []),
    [db, invoice]
  );

  const activityDefaults = useMemo(
    () =>
      invoice
        ? {
            customerInvoiceId: invoice.id,
            projectId: invoice.projectId,
            contractorId: invoice.contractorId,
            company: companyName,
          }
        : undefined,
    [invoice, companyName]
  );

  if (!invoice) {
    return (
      <div className="p-8 text-gray-400">
        Invoice not found.{" "}
        <Link href="/billing/invoices" className="text-[#0f6b4f] underline">
          Back to Accounts Receivable
        </Link>
      </div>
    );
  }

  const inv = invoice;

  async function markSent() {
    await save(markInvoiceSent(db, inv.id, db.meta.currentUserId));
  }

  async function handleAddNote(body: string) {
    await save(addInvoiceNote(db, inv.id, body));
  }

  return (
    <div className="p-8">
      <DetailBreadcrumb
        items={[
          { label: "Accounts Receivable", href: "/billing/invoices" },
          { label: invoice.number },
        ]}
      />
      <DetailHeader
        backHref="/billing/invoices"
        icon={ClipboardList}
        title={invoice.number}
        description={`Issued ${formatDate(invoice.issuedAt)}${invoice.dueDate ? ` · Due ${formatDate(invoice.dueDate)}` : ""}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft}`}
          >
            {invoice.status}
          </span>
          {isOverdueAr(invoice) && (
            <span className="text-xs font-medium text-red-600">Overdue</span>
          )}
          {invoice.source === "manual" && (
            <span className="text-xs text-gray-500">Manual entry</span>
          )}
          <InvoicePdfButton invoice={invoice} />
          {invoice.status === "draft" && (
            <Button size="sm" variant="outline" onClick={markSent}>
              Mark sent
            </Button>
          )}
          {invoice.status === "sent" && (
            <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
              Record payment
            </Button>
          )}
        </div>
      </DetailHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Line items</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="pb-2 pr-2 font-medium">Ticket</th>
                    <th className="pb-2 pr-2 font-medium">Description</th>
                    <th className="pb-2 pr-2 font-medium text-right">Qty</th>
                    <th className="pb-2 pr-2 font-medium text-right">Rate</th>
                    <th className="pb-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineGroups.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-gray-400">
                        No line items
                      </td>
                    </tr>
                  )}
                  {lineGroups.map((group) => (
                    <Fragment key={group.groupKey}>
                      {(group.tripNumber || group.lines.length > 1) && (
                        <tr className="bg-gray-50/80">
                          <td
                            colSpan={5}
                            className="px-2 py-2 text-xs font-medium text-gray-500"
                          >
                            {group.tripNumber && (
                              <span className="text-gray-700">Trip {group.tripNumber}</span>
                            )}
                            {group.tripNumber && group.ticketNumbers.length > 0 && " · "}
                            {group.ticketNumbers.length > 0 && (
                              <span>
                                Ticket{group.ticketNumbers.length > 1 ? "s" : ""}:{" "}
                                {group.ticketNumbers.join(", ")}
                              </span>
                            )}
                          </td>
                        </tr>
                      )}
                      {group.lines.map((line) => {
                        const ticket = getTicketForInvoiceLine(db, line);
                        const ticketNum = ticket ? ticket.number ?? ticket.paperTicketNumber : undefined;
                        const paperNum =
                          ticket?.paperTicketNumber &&
                          ticket.paperTicketNumber !== ticket?.number
                            ? ticket.paperTicketNumber
                            : undefined;
                        return (
                          <tr key={line.id} className="border-b border-gray-50">
                            <td className="py-2 pr-2 align-top font-mono text-xs text-[#0f6b4f]">
                              {ticketNum ? (
                                <div>
                                  {ticket?.id ? (
                                    <Link
                                      href={`/tickets/${ticket.id}`}
                                      className="hover:underline"
                                    >
                                      {ticketNum}
                                    </Link>
                                  ) : (
                                    ticketNum
                                  )}
                                  {paperNum && (
                                    <div className="mt-0.5 text-[10px] text-gray-400">
                                      Paper #{paperNum}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-2 pr-2 text-gray-900">{line.description}</td>
                            <td className="py-2 pr-2 text-right text-gray-600">
                              {line.qty} {line.unit}
                            </td>
                            <td className="py-2 pr-2 text-right text-gray-600">
                              {formatCurrency(line.sellRate)}/{unitRateLabel(line.unit)}
                            </td>
                            <td className="py-2 text-right font-medium">
                              {formatCurrency(line.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold text-gray-900">Bill to</h2>
            <p className="font-medium text-gray-900">{companyName ?? "—"}</p>
            {contractor && (
              <p className="mt-1 text-gray-600">
                {[contractor.firstName, contractor.lastName].filter(Boolean).join(" ")}
              </p>
            )}
            {contractor?.email && <p className="mt-1 text-gray-500">{contractor.email}</p>}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold text-gray-900">Job</h2>
            <dl className="space-y-2 text-gray-600">
              <div className="flex justify-between gap-2">
                <dt>Job name</dt>
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
              {project && (
                <div className="flex justify-between gap-2">
                  <dt>Project</dt>
                  <dd className="text-right">
                    <Link href={`/projects/${project.id}`} className="text-[#0f6b4f] hover:underline">
                      {project.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold text-gray-900">Totals</h2>
            <dl className="space-y-2">
              <div className="flex justify-between text-gray-600">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(invoice.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-gray-600">
                <dt>Tax</dt>
                <dd>{formatCurrency(invoice.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-900">
                <dt>Total</dt>
                <dd>{formatCurrency(invoice.total)}</dd>
              </div>
            </dl>
          </div>

          {invoice.payments && invoice.payments.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
              <h2 className="mb-3 font-semibold text-gray-900">Payments</h2>
              <ul className="space-y-2">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="text-gray-600">
                    <div className="flex justify-between gap-2">
                      <span>
                        {formatDate(p.paidAt)} · {p.method.toUpperCase()}
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

          {invoice.attachmentUrl && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
              <h2 className="mb-3 font-semibold text-gray-900">Attachment</h2>
              <a
                href={invoice.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0f6b4f] hover:underline break-all"
              >
                View PDF
              </a>
            </div>
          )}

          <ActivitiesPanel
            title="Follow-up"
            activities={activities}
            createDefaults={activityDefaults}
          />
          <BillingNotesPanel notes={invoice.notes} onAddNote={handleAddNote} />
        </aside>
      </div>

      <RecordPaymentSheet
        open={payOpen}
        onOpenChange={setPayOpen}
        documentKind="ar_invoice"
        documentId={inv.id}
        defaultAmount={inv.total}
      />
    </div>
  );
}
