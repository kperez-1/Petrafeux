import Link from "next/link";
import { Fragment } from "react";
import { formatCurrency } from "@/lib/utils";
import { getTicketById, TicketLineGroup } from "@/lib/billing-ledger";
import { Db, MaterialPriceUnit } from "@/lib/types";
import { unitRateLabel } from "@/lib/types";

function TicketCell({ db, ticketId }: { db: Db; ticketId?: string }) {
  const ticket = getTicketById(db, ticketId);
  const ticketNum = ticket ? ticket.number ?? ticket.paperTicketNumber : undefined;
  const paperNum =
    ticket?.paperTicketNumber && ticket.paperTicketNumber !== ticket?.number
      ? ticket.paperTicketNumber
      : undefined;

  if (!ticketNum) return <td className="py-2 pr-2 align-top font-mono text-xs text-gray-400">—</td>;

  return (
    <td className="py-2 pr-2 align-top font-mono text-xs text-[#0f6b4f]">
      {ticket?.id ? (
        <Link href={`/tickets/${ticket.id}`} className="hover:underline">
          {ticketNum}
        </Link>
      ) : (
        ticketNum
      )}
      {paperNum && <div className="mt-0.5 text-[10px] text-gray-400">Paper #{paperNum}</div>}
    </td>
  );
}

function GroupHeaderRow({ colSpan, tripNumber, ticketNumbers }: {
  colSpan: number;
  tripNumber?: string;
  ticketNumbers: string[];
}) {
  return (
    <tr className="bg-gray-50/80">
      <td colSpan={colSpan} className="px-2 py-2 text-xs font-medium text-gray-500">
        {tripNumber && <span className="text-gray-700">Trip {tripNumber}</span>}
        {tripNumber && ticketNumbers.length > 0 && " · "}
        {ticketNumbers.length > 0 && (
          <span>
            Ticket{ticketNumbers.length > 1 ? "s" : ""}: {ticketNumbers.join(", ")}
          </span>
        )}
      </td>
    </tr>
  );
}

export function CarrierSettlementLinesTable({
  db,
  groups,
}: {
  db: Db;
  groups: TicketLineGroup<{
    id: string;
    deliveryTicketId?: string;
    description: string;
    qty: number;
    unit: MaterialPriceUnit;
    buyRate: number;
    grossAmount: number;
    brokerFee: number;
    netPay: number;
  }>[];
}) {
  if (groups.length === 0) {
    return (
      <tr>
        <td colSpan={7} className="py-6 text-center text-gray-400">
          No line items
        </td>
      </tr>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <Fragment key={group.groupKey}>
          {(group.tripNumber || group.lines.length > 1) && (
            <GroupHeaderRow
              colSpan={7}
              tripNumber={group.tripNumber}
              ticketNumbers={group.ticketNumbers}
            />
          )}
          {group.lines.map((line) => (
            <tr key={line.id} className="border-b border-gray-50">
              <TicketCell db={db} ticketId={line.deliveryTicketId} />
              <td className="py-2 pr-2 text-gray-900">{line.description}</td>
              <td className="py-2 pr-2 text-right text-gray-600">
                {line.qty} {line.unit}
              </td>
              <td className="py-2 pr-2 text-right text-gray-600">
                {formatCurrency(line.buyRate)}/{unitRateLabel(line.unit)}
              </td>
              <td className="py-2 pr-2 text-right text-gray-600">
                {formatCurrency(line.grossAmount)}
              </td>
              <td className="py-2 pr-2 text-right text-gray-600">
                {formatCurrency(line.brokerFee)}
              </td>
              <td className="py-2 text-right font-medium">{formatCurrency(line.netPay)}</td>
            </tr>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export function VendorSettlementLinesTable({
  db,
  groups,
}: {
  db: Db;
  groups: TicketLineGroup<{
    id: string;
    deliveryTicketId?: string;
    description: string;
    qty: number;
    unit: MaterialPriceUnit;
    buyRate: number;
    amount: number;
  }>[];
}) {
  if (groups.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="py-6 text-center text-gray-400">
          No line items
        </td>
      </tr>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <Fragment key={group.groupKey}>
          {(group.tripNumber || group.lines.length > 1) && (
            <GroupHeaderRow
              colSpan={5}
              tripNumber={group.tripNumber}
              ticketNumbers={group.ticketNumbers}
            />
          )}
          {group.lines.map((line) => (
            <tr key={line.id} className="border-b border-gray-50">
              <TicketCell db={db} ticketId={line.deliveryTicketId} />
              <td className="py-2 pr-2 text-gray-900">{line.description}</td>
              <td className="py-2 pr-2 text-right text-gray-600">
                {line.qty} {line.unit}
              </td>
              <td className="py-2 pr-2 text-right text-gray-600">
                {formatCurrency(line.buyRate)}/{unitRateLabel(line.unit)}
              </td>
              <td className="py-2 text-right font-medium">{formatCurrency(line.amount)}</td>
            </tr>
          ))}
        </Fragment>
      ))}
    </>
  );
}
