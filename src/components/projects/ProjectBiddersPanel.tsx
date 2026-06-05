"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import {
  buildCompanySummaries,
  companySlug,
  getContactsForCompany,
} from "@/lib/contractors";
import {
  ensureBidderFromProjectSource,
  findBidderByCompany,
  getBiddersForProject,
} from "@/lib/project-bidders";
import { generateId } from "@/lib/utils";
import type { Project, ProjectBidder, ProjectBidderStatus } from "@/lib/types";
import { PROJECT_BIDDER_STATUSES } from "@/lib/types";

const BIDDER_STATUS_STYLES: Record<ProjectBidderStatus, string> = {
  proposal_requested: "bg-sky-50 text-sky-800 border-sky-200",
  proposal_presented: "bg-amber-50 text-amber-800 border-amber-200",
  won: "bg-green-50 text-green-800 border-green-200",
  lost: "bg-red-50 text-red-700 border-red-200",
};

export function ProjectBiddersPanel({ project }: { project: Project }) {
  const { db, save } = useDb();
  const [addOpen, setAddOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [status, setStatus] = useState<ProjectBidderStatus>("proposal_requested");

  const bidders = getBiddersForProject(db, project.id);
  const companies = useMemo(() => buildCompanySummaries(db), [db]);
  const contacts = company ? getContactsForCompany(db, company) : [];

  const missingSource =
    project.sourceCompany?.trim() &&
    !findBidderByCompany(db, project.id, project.sourceCompany);

  async function persistBidders(next: ProjectBidder[]) {
    await save({
      ...db,
      projectBidders: [
        ...db.projectBidders.filter((b) => b.projectId !== project.id),
        ...next,
      ],
    });
  }

  async function updateBidder(id: string, patch: Partial<ProjectBidder>) {
    const next = bidders.map((b) =>
      b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b
    );
    await persistBidders(next);
  }

  async function removeBidder(id: string) {
    if (!confirm("Remove this company from the bid list?")) return;
    await persistBidders(bidders.filter((b) => b.id !== id));
  }

  async function addBidder() {
    const name = company.trim();
    if (!name) return;
    if (findBidderByCompany(db, project.id, name)) {
      alert("This company is already on the bid list.");
      return;
    }
    const bidder: ProjectBidder = {
      id: generateId(),
      projectId: project.id,
      company: name,
      contractorId: contractorId || undefined,
      status,
      updatedAt: new Date().toISOString(),
    };
    await save({
      ...db,
      projectBidders: [...db.projectBidders, bidder],
    });
    setAddOpen(false);
    setCompany("");
    setContractorId("");
    setStatus("proposal_requested");
  }

  async function addFromSource() {
    const next = ensureBidderFromProjectSource(db, project);
    await save(next);
  }

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Bidding companies</h2>
          <p className="text-sm text-gray-500">
            Track each contractor bidding this job — proposal status and who won.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {missingSource && (
            <Button variant="outline" size="sm" onClick={addFromSource}>
              Add {project.sourceCompany}
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add company
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Company</th>
              <th className="px-4 py-3 text-left font-medium">Contact</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Notes</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {bidders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No bidding companies yet — add contractors who need a proposal or are competing
                  on this job.
                </td>
              </tr>
            )}
            {bidders.map((bidder) => {
              const contact = bidder.contractorId
                ? db.contractors.find((c) => c.id === bidder.contractorId)
                : undefined;
              const contactLabel = contact
                ? `${contact.firstName} ${contact.lastName}`.trim() || contact.email
                : "—";
              const statusLabel =
                PROJECT_BIDDER_STATUSES.find((s) => s.value === bidder.status)?.label ??
                bidder.status;

              return (
                <tr key={bidder.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <Link
                      href={`/contractors/${companySlug(bidder.company)}`}
                      className="font-medium text-[#0f6b4f] hover:underline"
                    >
                      {bidder.company}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {contact ? (
                      <span>
                        {contactLabel}
                        {contact.email && (
                          <span className="block text-xs text-gray-400">{contact.email}</span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className={`h-8 rounded-md border px-2 text-xs font-medium ${BIDDER_STATUS_STYLES[bidder.status]}`}
                      value={bidder.status}
                      onChange={(e) =>
                        updateBidder(bidder.id, {
                          status: e.target.value as ProjectBidderStatus,
                        })
                      }
                    >
                      {PROJECT_BIDDER_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <span className="sr-only">{statusLabel}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      className="h-8 text-sm"
                      placeholder="Follow-up notes…"
                      defaultValue={bidder.notes ?? ""}
                      onBlur={(e) => {
                        const notes = e.target.value.trim();
                        if (notes !== (bidder.notes ?? "")) {
                          updateBidder(bidder.id, { notes: notes || undefined });
                        }
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-600"
                      onClick={() => removeBidder(bidder.id)}
                      aria-label="Remove bidder"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateFormSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add bidding company"
        description="Link a contractor company competing on this project."
        submitLabel="Add to bid list"
        onSubmit={addBidder}
        disabled={!company.trim()}
      >
        <FormSection
          title="Company"
          description="Pick an existing company or type a new name."
        >
          <FormField label="Company name" required>
            <Input
              list="bidder-company-list"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setContractorId("");
              }}
            />
            <datalist id="bidder-company-list">
              {companies.map((c) => (
                <option key={c.slug} value={c.name} />
              ))}
            </datalist>
          </FormField>
          {contacts.length > 0 && (
            <FormField label="Primary contact">
              <select
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
              >
                <option value="">— Any / not set —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                    {c.email ? ` (${c.email})` : ""}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Initial status">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectBidderStatus)}
            >
              {PROJECT_BIDDER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </FormField>
        </FormSection>
      </CreateFormSheet>
    </section>
  );
}
