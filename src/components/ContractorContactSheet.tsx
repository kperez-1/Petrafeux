"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Contractor } from "@/lib/types";
import { generateId } from "@/lib/utils";

type ContactForm = Omit<Contractor, "id">;

const EMPTY: ContactForm = {
  company: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  ein: "",
  officeId: undefined,
  salespersonId: undefined,
  contactNotes: "",
};

export function ContractorContactSheet({
  open,
  onOpenChange,
  companyName,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  contact?: Contractor;
  onSaved?: () => void;
}) {
  const { db, save } = useDb();
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const isEdit = Boolean(contact);

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setForm({
        company: contact.company,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        address: contact.address,
        ein: contact.ein ?? "",
        officeId: contact.officeId,
        salespersonId: contact.salespersonId,
        contactNotes: contact.contactNotes ?? "",
      });
    } else {
      setForm({ ...EMPTY, company: companyName });
    }
  }, [open, contact, companyName]);

  async function submit() {
    if (!form.firstName.trim() && !form.lastName.trim() && !form.contactNotes?.trim()) return;

    if (contact) {
      const updated: Contractor = {
        ...contact,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        ein: form.ein?.trim() || undefined,
        contactNotes: form.contactNotes?.trim() || undefined,
      };
      await save({
        ...db,
        contractors: db.contractors.map((c) => (c.id === contact.id ? updated : c)),
      });
    } else {
      const c: Contractor = {
        id: generateId(),
        company: companyName,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        ein: form.ein?.trim() || undefined,
        contactNotes: form.contactNotes?.trim() || undefined,
      };
      await save({ ...db, contractors: [c, ...db.contractors] });
    }
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit contact" : "Add contact"}
      description={`${isEdit ? "Update" : "Add"} a contact at ${companyName}.`}
      submitLabel={isEdit ? "Save changes" : "Add contact"}
      onSubmit={submit}
      disabled={
        !isEdit &&
        !form.firstName.trim() &&
        !form.lastName.trim() &&
        !form.contactNotes?.trim() &&
        !form.phone.trim() &&
        !form.address.trim()
      }
    >
      <FormSection title="Contact" description="Person or role at this company">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name">
            <Input
              className="h-10"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </FormField>
          <FormField label="Last name">
            <Input
              className="h-10"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </FormField>
        </div>
        <FormField label="Email">
          <Input
            type="email"
            className="h-10"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </FormField>
        <FormField label="Phone">
          <div className="flex h-10 overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:border-[#0f6b4f] focus-within:ring-1 focus-within:ring-[#0f6b4f]">
            <span className="flex shrink-0 items-center gap-1.5 border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
              <span aria-hidden>🇺🇸</span>
              +1
            </span>
            <input
              type="tel"
              placeholder="(555) 000-0000"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </FormField>
        <FormField label="Address">
          <Input
            className="h-10"
            placeholder="Street, city, state, zip"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </FormField>
        <FormField label="EIN">
          <Input
            className="h-10"
            value={form.ein ?? ""}
            onChange={(e) => setForm({ ...form, ein: e.target.value })}
          />
        </FormField>
        <FormField label="Notes">
          <Input
            className="h-10"
            value={form.contactNotes ?? ""}
            onChange={(e) => setForm({ ...form, contactNotes: e.target.value })}
            placeholder="e.g. name and phone from import"
          />
        </FormField>
      </FormSection>
    </CreateFormSheet>
  );
}
