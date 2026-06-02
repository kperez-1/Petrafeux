"use client";

import { useState } from "react";
import { Route, Plus } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { generateId, formatCurrency } from "@/lib/utils";
import { HaulRate } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function HaulRatesPage() {
  const { db, save } = useDb();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ zoneName: "", minMiles: "", maxMiles: "", ratePerTon: "" });

  async function create() {
    if (!form.zoneName.trim()) return;
    const hr: HaulRate = {
      id: generateId(),
      zoneName: form.zoneName.trim(),
      minMiles: parseFloat(form.minMiles) || 0,
      maxMiles: parseFloat(form.maxMiles) || 0,
      ratePerTon: parseFloat(form.ratePerTon) || 0,
    };
    await save({ ...db, haulRates: [...db.haulRates, hr].sort((a, b) => a.minMiles - b.minMiles) });
    setForm({ zoneName: "", minMiles: "", maxMiles: "", ratePerTon: "" });
    setOpen(false);
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <Route className="h-6 w-6 text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Haul Rates</h1>
            <p className="text-sm text-gray-500">Rate table by distance zone</p>
          </div>
        </div>
        <Button className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add Rate
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Zone</th>
              <th className="px-4 py-3 text-left font-medium">Min Miles</th>
              <th className="px-4 py-3 text-left font-medium">Max Miles</th>
              <th className="px-4 py-3 text-left font-medium">Rate / Ton</th>
            </tr>
          </thead>
          <tbody>
            {db.haulRates.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No rates yet.</td></tr>
            )}
            {db.haulRates.map((hr) => (
              <tr key={hr.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{hr.zoneName}</td>
                <td className="px-4 py-3 text-gray-500">{hr.minMiles}</td>
                <td className="px-4 py-3 text-gray-500">{hr.maxMiles}</td>
                <td className="px-4 py-3 text-gray-700">{formatCurrency(hr.ratePerTon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[420px]">
          <SheetHeader><SheetTitle>Add Haul Rate</SheetTitle></SheetHeader>
          <div className="mt-6 space-y-4">
            {[["Zone Name", "zoneName"], ["Min Miles", "minMiles"], ["Max Miles", "maxMiles"], ["Rate per Ton ($)", "ratePerTon"]].map(([label, field]) => (
              <div key={field} className="space-y-1">
                <label className="text-sm font-medium text-gray-700">{label}</label>
                <Input
                  type={field === "zoneName" ? "text" : "number"}
                  value={(form as Record<string, string>)[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  placeholder={label}
                />
              </div>
            ))}
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex gap-3 border-t bg-white p-4">
            <Button className="flex-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white" onClick={create} disabled={!form.zoneName.trim()}>Add Rate</Button>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
