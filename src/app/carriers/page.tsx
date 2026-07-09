"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Truck, Plus, Pencil } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { useActiveOffice } from "@/components/ActiveOfficeProvider";
import { generateId } from "@/lib/utils";
import { Carrier } from "@/lib/types";
import { carriersForOffice, deleteCarrier, upsertCarrier } from "@/lib/dispatch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  PageActionCards,
  PageActionCard,
  PageToolbar,
  CreateFormSheet,
  FormSection,
  FormField,
} from "@/components/layout";

const EMPTY: Omit<Carrier, "id"> = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  paymentTermsDays: 30,
  taxId: "",
  w9OnFile: false,
  w9FileUrl: "",
};

export default function CarriersPage() {
  const { db, save } = useDb();
  const { officeId } = useActiveOffice();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const carriers = useMemo(
    () =>
      carriersForOffice(db, officeId).filter((c) =>
        `${c.name} ${c.contactName ?? ""} ${c.phone} ${c.email}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [db, officeId, search]
  );

  function resetForm() {
    setForm(EMPTY);
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(carrier: Carrier) {
    setEditId(carrier.id);
    setForm({
      name: carrier.name,
      contactName: carrier.contactName ?? "",
      phone: carrier.phone,
      email: carrier.email,
      officeId: carrier.officeId,
      paymentTermsDays: carrier.paymentTermsDays ?? 30,
      taxId: carrier.taxId ?? "",
      w9OnFile: carrier.w9OnFile ?? false,
      w9FileUrl: carrier.w9FileUrl ?? "",
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) return;
    const carrier: Carrier = {
      id: editId ?? generateId(),
      name: form.name.trim(),
      contactName: form.contactName?.trim() || undefined,
      phone: form.phone.trim(),
      email: form.email.trim(),
      officeId: form.officeId ?? officeId,
      paymentTermsDays: form.paymentTermsDays ?? 30,
      taxId: form.taxId?.trim() || undefined,
      w9OnFile: form.w9OnFile || undefined,
      w9FileUrl: form.w9FileUrl?.trim() || undefined,
    };
    await save(upsertCarrier(db, carrier));
    resetForm();
    setOpen(false);
  }

  async function remove(carrierId: string) {
    if (!confirm("Delete this carrier?")) return;
    await save(deleteCarrier(db, carrierId));
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={Truck}
        title="Carriers"
        description="Trucking companies and haulers for dispatch and AP settlements"
      />

      <PageActionCards>
        <PageActionCard
          icon={Plus}
          title="New carrier"
          description="Add a carrier for load dispatch and settlement."
          buttonLabel="New carrier"
          onClick={openCreate}
        />
      </PageActionCards>

      <PageToolbar>
        <Input
          placeholder="Search carriers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </PageToolbar>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Contact</th>
              <th className="px-4 py-3 text-left font-medium">Phone</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {carriers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No carriers yet — add one above.
                </td>
              </tr>
            )}
            {carriers.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.contactName || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{c.phone || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{c.email || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-[#0f6b4f] hover:underline inline-flex items-center gap-1 text-xs"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      className="text-red-600 hover:underline text-xs"
                      onClick={() => remove(c.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateFormSheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
        title={editId ? "Edit carrier" : "New carrier"}
        description="Trucking company used for dispatch and AP settlements."
        submitLabel={editId ? "Save carrier" : "Create carrier"}
        onSubmit={submit}
      >
        <FormSection title="Carrier details" description="Contact info for dispatch and settlements.">
          <FormField label="Company name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField label="Contact name">
            <Input
              value={form.contactName ?? ""}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            />
          </FormField>
          <FormField label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </FormField>
          <FormField label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormField>
          <FormField label="Payment terms (days)">
            <Input
              type="number"
              min="0"
              value={form.paymentTermsDays ?? 30}
              onChange={(e) =>
                setForm({ ...form, paymentTermsDays: parseInt(e.target.value, 10) || 30 })
              }
            />
          </FormField>
          <FormField label="Tax ID (EIN)">
            <Input
              value={form.taxId ?? ""}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
            />
          </FormField>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2">
            <input
              type="checkbox"
              checked={form.w9OnFile ?? false}
              onChange={(e) => setForm({ ...form, w9OnFile: e.target.checked })}
              className="h-4 w-4 accent-[#0f6b4f]"
            />
            <span className="text-sm text-gray-700">W-9 on file</span>
          </label>
          <FormField label="W-9 file URL">
            <Input
              value={form.w9FileUrl ?? ""}
              onChange={(e) => setForm({ ...form, w9FileUrl: e.target.value })}
            />
          </FormField>
        </FormSection>
      </CreateFormSheet>
    </div>
  );
}
