"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { companySlug } from "@/lib/contractors";

export interface CompanyEditValues {
  name: string;
  address: string;
  phone: string;
  email: string;
  ein: string;
}

export function CompanyEditSheet({
  open,
  onOpenChange,
  originalName,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Company name before edit (for matching records). */
  originalName: string;
  initial: CompanyEditValues;
  onSaved?: (nextName: string) => void;
}) {
  const { db, save } = useDb();
  const [form, setForm] = useState(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  async function submit() {
    const nextName = form.name.trim();
    if (!nextName) return;
    const key = originalName.trim().toLowerCase();

    await save({
      ...db,
      contractors: db.contractors.map((c) =>
        c.company.trim().toLowerCase() === key
          ? {
              ...c,
              company: nextName,
              address: form.address.trim(),
              phone: form.phone.trim(),
              email: form.email.trim(),
              ein: form.ein.trim() || undefined,
            }
          : c
      ),
      activities: db.activities.map((a) =>
        a.company?.trim().toLowerCase() === key ? { ...a, company: nextName } : a
      ),
    });

    onSaved?.(nextName);
    onOpenChange(false);
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit company"
      description="Updates name, address, and phone on all contacts for this company."
      submitLabel="Save changes"
      onSubmit={submit}
      disabled={!form.name.trim()}
    >
      <FormSection title="Company" description="Shown on the contractors list and company page">
        <FormField label="Company name" required>
          <Input
            className="h-10"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField label="Address">
          <Input
            className="h-10"
            placeholder="Street, city, state, zip"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </FormField>
        <FormField label="Phone">
          <Input
            type="tel"
            className="h-10"
            placeholder="(555) 000-0000"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </FormField>
        <FormField label="Email">
          <Input
            type="email"
            className="h-10"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </FormField>
        <FormField label="EIN">
          <Input
            className="h-10"
            placeholder="XX-XXXXXXX"
            value={form.ein}
            onChange={(e) => setForm({ ...form, ein: e.target.value })}
          />
        </FormField>
      </FormSection>
    </CreateFormSheet>
  );
}

export function companyEditHrefAfterRename(nextName: string): string {
  return `/contractors/${companySlug(nextName)}`;
}
