"use client";

import { useState } from "react";
import { Store, Search, Plus } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { generateId } from "@/lib/utils";
import { Vendor } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const EMPTY: Omit<Vendor, "id"> = { name: "", address: "", type: "quarry" };

export default function VendorsPage() {
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const filtered = db.vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  async function create() {
    if (!form.name.trim()) return;
    const v: Vendor = { id: generateId(), ...form };
    await save({ ...db, vendors: [v, ...db.vendors] });
    setForm(EMPTY);
    setOpen(false);
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <Store className="h-6 w-6 text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
            <p className="text-sm text-gray-500">Quarries and disposal sites</p>
          </div>
        </div>
        <Button className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Vendor
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input className="pl-9" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Address</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No vendors yet.</td></tr>
            )}
            {filtered.map((v) => (
              <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                <td className="px-4 py-3"><span className="capitalize text-gray-500">{v.type}</span></td>
                <td className="px-4 py-3 text-gray-500">{v.address || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[420px]">
          <SheetHeader><SheetTitle>New Vendor</SheetTitle></SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vendor name" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "quarry" | "disposal" })}
              >
                <option value="quarry">Quarry</option>
                <option value="disposal">Disposal</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex gap-3 border-t bg-white p-4">
            <Button className="flex-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white" onClick={create} disabled={!form.name.trim()}>
              Create Vendor
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
