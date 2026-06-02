"use client";

import { useState } from "react";
import { Package, Search, Plus } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { generateId, formatCurrency } from "@/lib/utils";
import { Material } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function MaterialsPage() {
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "", vendorId: "", pricePerTon: "" });

  const filtered = db.materials.filter((m) =>
    `${m.name} ${m.type}`.toLowerCase().includes(search.toLowerCase())
  );

  async function create() {
    if (!form.name.trim()) return;
    const vendor = db.vendors.find((v) => v.id === form.vendorId);
    const m: Material = {
      id: generateId(),
      name: form.name.trim(),
      type: form.type.trim(),
      vendorId: form.vendorId,
      vendorName: vendor?.name,
      pricePerTon: parseFloat(form.pricePerTon) || 0,
    };
    await save({ ...db, materials: [m, ...db.materials] });
    setForm({ name: "", type: "", vendorId: "", pricePerTon: "" });
    setOpen(false);
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <Package className="h-6 w-6 text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Materials</h1>
            <p className="text-sm text-gray-500">Material catalog with pricing</p>
          </div>
        </div>
        <Button className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Material
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input className="pl-9" placeholder="Search materials..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Vendor</th>
              <th className="px-4 py-3 text-left font-medium">Price/Ton</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No materials yet.</td></tr>
            )}
            {filtered.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                <td className="px-4 py-3 text-gray-500">{m.type || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{m.vendorName || "—"}</td>
                <td className="px-4 py-3 text-gray-700">{formatCurrency(m.pricePerTon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[420px]">
          <SheetHeader><SheetTitle>New Material</SheetTitle></SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. #57 Stone" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="e.g. 57-stone" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Vendor</label>
              <select className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
                <option value="">No vendor</option>
                {db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Price per Ton ($)</label>
              <Input type="number" value={form.pricePerTon} onChange={(e) => setForm({ ...form, pricePerTon: e.target.value })} placeholder="0.00" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex gap-3 border-t bg-white p-4">
            <Button className="flex-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white" onClick={create} disabled={!form.name.trim()}>Create Material</Button>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
