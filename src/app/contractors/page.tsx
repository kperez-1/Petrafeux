"use client";

import { useState } from "react";
import { Users, Search, Plus } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { generateId } from "@/lib/utils";
import { Contractor } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const EMPTY: Omit<Contractor, "id"> = { firstName: "", lastName: "", company: "", email: "", phone: "", address: "" };

export default function ContractorsPage() {
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const filtered = db.contractors.filter((c) =>
    `${c.firstName} ${c.lastName} ${c.company}`.toLowerCase().includes(search.toLowerCase())
  );

  async function create() {
    if (!form.firstName.trim()) return;
    const c: Contractor = { id: generateId(), ...form };
    await save({ ...db, contractors: [c, ...db.contractors] });
    setForm(EMPTY);
    setOpen(false);
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <Users className="h-6 w-6 text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Contractors</h1>
            <p className="text-sm text-gray-500">Manage your contractor contacts</p>
          </div>
        </div>
        <Button className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Contractor
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input className="pl-9" placeholder="Search contractors..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Company</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Phone</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No contractors yet.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-gray-500">{c.company || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{c.email || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{c.phone || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[420px]">
          <SheetHeader><SheetTitle>New Contractor</SheetTitle></SheetHeader>
          <div className="mt-6 space-y-4">
            {[
              ["First Name", "firstName"], ["Last Name", "lastName"],
              ["Company", "company"], ["Email", "email"],
              ["Phone", "phone"], ["Address", "address"],
            ].map(([label, field]) => (
              <div key={field} className="space-y-1">
                <label className="text-sm font-medium text-gray-700">{label}</label>
                <Input
                  value={(form as Record<string, string>)[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  placeholder={label}
                />
              </div>
            ))}
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex gap-3 border-t bg-white p-4">
            <Button className="flex-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white" onClick={create} disabled={!form.firstName.trim()}>
              Create Contractor
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
