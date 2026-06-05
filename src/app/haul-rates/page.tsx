"use client";

import { useState } from "react";
import { Route, Percent } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatCurrency } from "@/lib/utils";
import { HaulRate } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  PageToolbar,
  CreateFormSheet,
  FormSection,
  FormField,
} from "@/components/layout";
import { impliedRatePerCy, impliedRatePerTon } from "@/lib/haul-pricing";

export default function HaulRatesPage() {
  const { db, save } = useDb();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoad, setEditLoad] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState("10");

  const sorted = [...db.haulRates].sort((a, b) => a.miles - b.miles);

  async function saveRate(id: string, ratePerLoad: number) {
    await save({
      ...db,
      haulRates: db.haulRates.map((h) =>
        h.id === id ? { ...h, ratePerLoad } : h
      ),
    });
    setEditingId(null);
  }

  function startEdit(hr: HaulRate) {
    setEditingId(hr.id);
    setEditLoad(String(hr.ratePerLoad));
  }

  async function applyBulkAdjust() {
    const pct = parseFloat(bulkPercent);
    if (!Number.isFinite(pct)) return;
    const factor = 1 + pct / 100;
    const updated = db.haulRates.map((h) => ({
      ...h,
      ratePerLoad: Math.round(h.ratePerLoad * factor * 100) / 100,
    }));
    await save({
      ...db,
      haulRates: updated,
      meta: {
        ...db.meta,
        haulRateAdjustmentPercent: pct,
      },
    });
    setBulkOpen(false);
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={Route}
        title="Haul Rates"
        description="Price per load by mile (1–150). TN = load ÷ 21.5, CY = load ÷ 18."
      />

      <PageToolbar>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setBulkOpen(true)}>
          <Percent className="h-4 w-4" />
          Bulk adjust %
        </Button>
        {db.meta.haulRateAdjustmentPercent != null && (
          <span className="text-xs text-gray-500">
            Last bulk: {db.meta.haulRateAdjustmentPercent > 0 ? "+" : ""}
            {db.meta.haulRateAdjustmentPercent}%
          </span>
        )}
      </PageToolbar>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden max-h-[calc(100vh-220px)] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Mile</th>
              <th className="px-4 py-3 text-left font-medium">Price / load</th>
              <th className="px-4 py-3 text-left font-medium">$/TN</th>
              <th className="px-4 py-3 text-left font-medium">$/CY</th>
              <th className="px-4 py-3 text-left font-medium w-24" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No rates — run import:atpb or add manually.
                </td>
              </tr>
            )}
            {sorted.map((hr) => (
              <tr key={hr.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{hr.miles}</td>
                <td className="px-4 py-2">
                  {editingId === hr.id ? (
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 w-28"
                      value={editLoad}
                      onChange={(e) => setEditLoad(e.target.value)}
                    />
                  ) : (
                    <span className="text-gray-700">{formatCurrency(hr.ratePerLoad)}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {formatCurrency(impliedRatePerTon(hr.ratePerLoad))}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {formatCurrency(impliedRatePerCy(hr.ratePerLoad))}
                </td>
                <td className="px-4 py-2">
                  {editingId === hr.id ? (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        onClick={() => saveRate(hr.id, parseFloat(editLoad) || 0)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => startEdit(hr)}
                    >
                      Edit
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateFormSheet
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Bulk adjust haul rates"
        description="Apply a percentage change to every mile rate (e.g. 10 increases all by 10%)."
        submitLabel="Apply"
        onSubmit={applyBulkAdjust}
        disabled={!bulkPercent.trim()}
      >
        <FormSection title="Adjustment" description="Positive = increase, negative = decrease">
          <FormField label="Percent change" required>
            <Input
              type="number"
              step="0.1"
              className="h-10"
              value={bulkPercent}
              onChange={(e) => setBulkPercent(e.target.value)}
              placeholder="e.g. 10 or -5"
            />
          </FormField>
        </FormSection>
      </CreateFormSheet>
    </div>
  );
}
