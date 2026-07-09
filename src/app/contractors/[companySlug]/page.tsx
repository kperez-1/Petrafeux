"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  HardHat,
  FolderOpen,
  Users,
  Plus,
  FileText,
  Mail,
  Phone,
  Pencil,
  Trash2,
} from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatDate } from "@/lib/utils";
import {
  parseCompanySlug,
  getContactsForCompany,
  getProjectsForCompany,
  getQuotesForCompany,
  findCompanySummary,
} from "@/lib/contractors";
import { arBalanceSummary, invoicesForCompany } from "@/lib/billing-ledger";
import { PartyBalanceCard } from "@/components/billing/PartyBalanceCard";
import { Contractor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ActivitiesPanel } from "@/components/activities/ActivitiesPanel";
import { getActivitiesForCompany } from "@/lib/activities";
import { ContractorContactSheet } from "@/components/ContractorContactSheet";
import {
  CompanyEditSheet,
  companyEditHrefAfterRename,
} from "@/components/CompanyEditSheet";

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug: slug } = use(params);
  const router = useRouter();
  const companyName = parseCompanySlug(slug);
  const { db, save } = useDb();
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contractor | undefined>();
  const [companyEditOpen, setCompanyEditOpen] = useState(false);

  const summary = findCompanySummary(db, companyName);
  const contacts = getContactsForCompany(db, companyName);
  const projects = getProjectsForCompany(db, companyName);
  const quotes = getQuotesForCompany(db, companyName);
  const companyActivities = getActivitiesForCompany(db, companyName);
  const companyInvoices = invoicesForCompany(db, companyName);
  const arSummary = arBalanceSummary(companyInvoices);

  if (!summary && contacts.length === 0) {
    return (
      <div className="p-8 text-gray-400">
        Company not found.{" "}
        <Link href="/contractors" className="text-[#0f6b4f] underline">
          Back to contractors
        </Link>
      </div>
    );
  }

  async function deleteContact(id: string) {
    if (!confirm("Remove this contact?")) return;
    await save({
      ...db,
      contractors: db.contractors.filter((c) => c.id !== id),
    });
  }

  const display = summary ?? {
    name: companyName,
    address: contacts[0]?.address ?? "",
    phone: contacts[0]?.phone ?? "",
    email: contacts[0]?.email ?? "",
    ein: contacts[0]?.ein,
  };

  function openAddContact() {
    setEditingContact(undefined);
    setContactOpen(true);
  }

  function openEditContact(c: Contractor) {
    setEditingContact(c);
    setContactOpen(true);
  }

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/contractors" className="hover:text-gray-900">
          Contracting Companies
        </Link>
        <span>›</span>
        <span className="text-gray-900">{display.name}</span>
      </div>

      <div className="mb-8 flex items-start gap-4">
        <Link
          href="/contractors"
          className="mt-1 text-gray-400 hover:text-gray-600"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0f6b4f]/10">
          <HardHat className="h-7 w-7 text-[#0f6b4f]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900">{display.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {display.address || "No address on file"}
            {display.phone ? ` · ${display.phone}` : ""}
          </p>
          {display.ein && (
            <p className="mt-1 text-xs text-gray-400">EIN {display.ein}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setCompanyEditOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit company
        </Button>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 max-w-xl">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-semibold text-gray-900">{projects.length}</p>
          <p className="text-sm text-gray-500">Projects bidding</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-2xl font-semibold text-gray-900">{contacts.length}</p>
          <p className="text-sm text-gray-500">Contacts</p>
        </div>
      </div>

      <div className="mb-8 max-w-md">
        <PartyBalanceCard
          title="Accounts Receivable"
          openTotal={arSummary.openTotal}
          openCount={arSummary.openCount}
          paidTotal={arSummary.paidTotal}
          paidCount={arSummary.paidCount}
          viewHref={`/billing/invoices?bucket=open&company=${slug}`}
          viewAllHref={`/billing/invoices?bucket=all&company=${slug}`}
          emptyHint="No invoices yet — billing is created when delivery tickets are approved."
        />
      </div>

      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Project</th>
                <th className="px-4 py-3 text-left font-medium">Quotes</th>
                <th className="px-4 py-3 text-left font-medium">Latest activity</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    No projects linked yet — assign this company on a quote.
                  </td>
                </tr>
              )}
              {projects.map((project) => {
                const projectQuotes = quotes.filter((q) => q.projectId === project.id);
                const latest = projectQuotes
                  .map((q) => q.createdAt)
                  .sort()
                  .reverse()[0];
                return (
                  <tr key={project.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-gray-900 hover:text-[#0f6b4f]"
                      >
                        {project.name}
                      </Link>
                      {project.address && (
                        <p className="text-xs text-gray-400 truncate max-w-xs">
                          {project.address}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {projectQuotes.length === 0 ? (
                        "—"
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {projectQuotes.map((q) => (
                            <Link
                              key={q.id}
                              href={`/quotes/${q.id}`}
                              className="inline-flex items-center gap-1 text-[#0f6b4f] hover:underline"
                            >
                              <FileText className="h-3 w-3" />
                              {q.number}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {latest ? formatDate(latest) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-8">
        <ActivitiesPanel
          activities={companyActivities}
          createDefaults={{ company: companyName }}
        />
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
          </div>
          <Button
            size="sm"
            className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1"
            onClick={openAddContact}
          >
            <Plus className="h-4 w-4" /> Add contact
          </Button>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Phone</th>
                <th className="px-4 py-3 text-left font-medium">Address</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No contacts for this company.
                  </td>
                </tr>
              )}
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {c.firstName || c.lastName
                      ? `${c.firstName} ${c.lastName}`.trim()
                      : c.contactNotes || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {c.email}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {c.phone}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                    {c.address || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditContact(c)}
                        className="text-xs text-[#0f6b4f] hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteContact(c.id)}
                        className="text-gray-400 hover:text-red-600"
                        aria-label="Delete contact"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ContractorContactSheet
        open={contactOpen}
        onOpenChange={setContactOpen}
        companyName={companyName}
        contact={editingContact}
      />

      <CompanyEditSheet
        open={companyEditOpen}
        onOpenChange={setCompanyEditOpen}
        originalName={companyName}
        initial={{
          name: display.name,
          address: display.address,
          phone: display.phone,
          email: display.email,
          ein: display.ein ?? "",
        }}
        onSaved={(nextName) => {
          if (nextName !== companyName) {
            router.replace(companyEditHrefAfterRename(nextName));
          }
        }}
      />
    </div>
  );
}
