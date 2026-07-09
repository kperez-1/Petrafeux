import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

export function PartyBalanceCard({
  title,
  openTotal,
  openCount,
  paidTotal,
  paidCount,
  viewHref,
  viewAllHref,
  owedLabel = "Owed to us",
  paidLabel = "Paid",
  emptyHint,
}: {
  title: string;
  openTotal: number;
  openCount: number;
  paidTotal: number;
  paidCount: number;
  viewHref: string;
  viewAllHref?: string;
  owedLabel?: string;
  paidLabel?: string;
  emptyHint?: string;
}) {
  const hasActivity = openCount > 0 || paidCount > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {!hasActivity && emptyHint ? (
        <p className="mt-2 text-sm text-gray-400">{emptyHint}</p>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{owedLabel}</dt>
            <dd className="font-medium text-gray-900">
              {formatCurrency(openTotal)}
              <span className="ml-1 text-xs font-normal text-gray-400">
                ({openCount} open)
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{paidLabel}</dt>
            <dd className="text-gray-700">
              {formatCurrency(paidTotal)}
              <span className="ml-1 text-xs text-gray-400">({paidCount})</span>
            </dd>
          </div>
        </dl>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={viewHref}
          className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50"
        >
          View open →
        </Link>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-[#0f6b4f] hover:bg-gray-50"
          >
            View all
          </Link>
        )}
      </div>
    </div>
  );
}
