"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  HardHat,
  Search,
  Plus,
  Upload,
  SlidersHorizontal,
  Check,
  Pencil,
} from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { generateId } from "@/lib/utils";
import { Contractor } from "@/lib/types";
import { buildCompanySummaries, getContactsForCompany } from "@/lib/contractors";
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
import { CompanyEditSheet } from "@/components/CompanyEditSheet";

const EMPTY: Omit<Contractor, "id"> = {
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  address: "",
  ein: "",
};

const COLUMN_DEFS = [
  { id: "name", label: "Name", defaultVisible: true },
  { id: "address", label: "Address", defaultVisible: true },
  { id: "phone", label: "Phone", defaultVisible: true },
  { id: "contacts", label: "Contractors", defaultVisible: true },
  { id: "projects", label: "Projects", defaultVisible: true },
  { id: "email", label: "Email", defaultVisible: false },
  { id: "ein", label: "EIN", defaultVisible: false },
] as const;

type ColumnId = (typeof COLUMN_DEFS)[number]["id"];

const DEFAULT_VISIBLE = new Set(
  COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => c.id)
);

export default function ContractorsPage() {
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(
    () => new Set(DEFAULT_VISIBLE)
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [editCompany, setEditCompany] = useState<{
    originalName: string;
    initial: { name: string; address: string; phone: string; email: string; ein: string };
  } | null>(null);

  const companies = useMemo(() => buildCompanySummaries(db), [db]);

  const filtered = useMemo(
    () =>
      companies.filter((co) => {
        if (officeFilter) {
          const contacts = getContactsForCompany(db, co.name);
          if (!contacts.some((c) => c.officeId === officeFilter)) return false;
        }
        return `${co.name} ${co.address} ${co.phone} ${co.email}`
          .toLowerCase()
          .includes(search.toLowerCase());
      }),
    [companies, search, officeFilter, db]
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    }
    if (columnsOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [columnsOpen]);

  function resetForm() {
    setForm(EMPTY);
  }

  function toggleColumn(id: ColumnId) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function create() {
    if (!form.company.trim()) return;
    const c: Contractor = {
      id: generateId(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      company: form.company.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      ein: form.ein?.trim() || undefined,
    };
    await save({ ...db, contractors: [c, ...db.contractors] });
    resetForm();
    setOpen(false);
  }

  const col = (id: ColumnId) => visibleColumns.has(id);

  return (
    <div className="p-8">
      <PageHeader
        icon={HardHat}
        title="Contracting Companies"
        description="View and organize contractors, quotes, and contact details by company"
      />

      <PageActionCards>
        <PageActionCard
          icon={Plus}
          title="New Company"
          description="Create a new contracting company and add contractors to it."
          buttonLabel="New Company"
          onClick={() => setOpen(true)}
        />
        <PageActionCard
          icon={Upload}
          title="Import Contractors"
          description="Run npm run import:contractors, then Settings → Load contractors from import (local mode)."
          buttonLabel="Import"
          variant="outline"
          disabled
          disabledTitle="Use Settings → Load contractors from import after running npm run import:contractors"
        />
      </PageActionCards>

      <PageToolbar>
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9 h-10"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
          value={officeFilter}
          onChange={(e) => setOfficeFilter(e.target.value)}
        >
          <option value="">All offices</option>
          {db.offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code}
            </option>
          ))}
        </select>
        <div className="relative" ref={columnsRef}>
          <Button
            variant="outline"
            className="gap-2 h-10"
            onClick={() => setColumnsOpen((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Columns
          </Button>
          {columnsOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Show columns
              </p>
              {COLUMN_DEFS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => toggleColumn(c.id)}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      col(c.id)
                        ? "border-[#0f6b4f] bg-[#0f6b4f] text-white"
                        : "border-gray-300"
                    }`}
                  >
                    {col(c.id) && <Check className="h-3 w-3" />}
                  </span>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </PageToolbar>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              {col("name") && <th className="px-4 py-3 text-left font-medium">Name</th>}
              {col("address") && (
                <th className="px-4 py-3 text-left font-medium">Address</th>
              )}
              {col("phone") && <th className="px-4 py-3 text-left font-medium">Phone</th>}
              {col("contacts") && (
                <th className="px-4 py-3 text-left font-medium">Contractors</th>
              )}
              {col("projects") && (
                <th className="px-4 py-3 text-left font-medium">Projects</th>
              )}
              {col("email") && <th className="px-4 py-3 text-left font-medium">Email</th>}
              {col("ein") && <th className="px-4 py-3 text-left font-medium">EIN</th>}
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.size + 1}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No companies yet — create one above.
                </td>
              </tr>
            )}
            {filtered.map((co) => (
              <tr
                key={co.slug}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                {col("name") && (
                  <td className="px-4 py-3">
                    <Link
                      href={`/contractors/${co.slug}`}
                      className="font-medium text-gray-900 hover:text-[#0f6b4f]"
                    >
                      {co.name}
                    </Link>
                  </td>
                )}
                {col("address") && (
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {co.address || "—"}
                  </td>
                )}
                {col("phone") && (
                  <td className="px-4 py-3 text-gray-500">{co.phone || "—"}</td>
                )}
                {col("contacts") && (
                  <td className="px-4 py-3 text-gray-700">{co.contactsCount}</td>
                )}
                {col("projects") && (
                  <td className="px-4 py-3 text-gray-700">{co.projectsCount}</td>
                )}
                {col("email") && (
                  <td className="px-4 py-3 text-gray-500">{co.email || "—"}</td>
                )}
                {col("ein") && (
                  <td className="px-4 py-3 text-gray-500">{co.ein || "—"}</td>
                )}
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-[#0f6b4f] hover:underline"
                    onClick={() =>
                      setEditCompany({
                        originalName: co.name,
                        initial: {
                          name: co.name,
                          address: co.address,
                          phone: co.phone,
                          email: co.email,
                          ein: co.ein ?? "",
                        },
                      })
                    }
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editCompany && (
        <CompanyEditSheet
          open={Boolean(editCompany)}
          onOpenChange={(o) => {
            if (!o) setEditCompany(null);
          }}
          originalName={editCompany.originalName}
          initial={editCompany.initial}
          onSaved={() => setEditCompany(null)}
        />
      )}

      <CreateFormSheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetForm();
        }}
        title="New Company"
        description="Create a new contracting company."
        submitLabel="Create Company"
        onSubmit={create}
        disabled={!form.company.trim()}
      >
        <FormSection title="General" description="Basic company identification and location">
          <FormField label="Company name" required>
            <Input
              className="h-10"
              placeholder="Company name"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </FormField>
          <FormField label="Address">
            <Input
              className="h-10"
              placeholder="Company address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </FormField>
        </FormSection>

        <FormSection title="Contact" description="How to reach this company">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First name">
              <Input
                className="h-10"
                placeholder="First name"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </FormField>
            <FormField label="Last name">
              <Input
                className="h-10"
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </FormField>
          </div>
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
          <FormField label="Email">
            <Input
              type="email"
              className="h-10"
              placeholder="company@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormField>
        </FormSection>

        <FormSection title="Billing" description="Tax and invoicing details">
          <FormField label="EIN">
            <Input
              className="h-10"
              placeholder="XX-XXXXXXX"
              value={form.ein ?? ""}
              onChange={(e) => setForm({ ...form, ein: e.target.value })}
            />
          </FormField>
        </FormSection>
      </CreateFormSheet>
    </div>
  );
}
