"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Search, Plus, MapPin } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatDate, formatCurrency, generateId } from "@/lib/utils";
import { calcQuote } from "@/lib/quote-calc";
import { generateQuoteNumber } from "@/lib/storage";
import { Quote } from "@/lib/types";
import {
  PageHeader,
  PageActionCards,
  PageActionCard,
  PageToolbar,
  CreateFormSheet,
  FormSection,
  FormField,
} from "@/components/layout";
import { Input } from "@/components/ui/input";
import { ProjectPickerField } from "@/components/projects/ProjectPickerField";
import { QuotePdfButton } from "@/components/quotes/QuotePdfButton";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-yellow-100 text-yellow-800 border-yellow-200",
  unsent: "bg-gray-100 text-gray-600 border-gray-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

export default function QuotesPage() {
  const { db, save } = useDb();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [jobName, setJobName] = useState("");

  const filtered = db.quotes.filter(
    (q) =>
      q.jobName.toLowerCase().includes(search.toLowerCase()) ||
      q.number.toLowerCase().includes(search.toLowerCase())
  );

  async function createQuote() {
    if (!projectId) return;
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) return;
    const counter = (db.meta?.quoteCounter ?? 0) + 1;
    const newQuote: Quote = {
      id: generateId(),
      projectId: project.id,
      projectName: project.name,
      number: generateQuoteNumber(counter),
      jobName: jobName.trim() || project.name,
      status: "unsent",
      taxRate: db.meta.defaultTaxRate ?? 7,
      routes: [],
      createdAt: new Date().toISOString(),
      history: [{ id: generateId(), type: "created", at: new Date().toISOString() }],
    };
    await save({
      ...db,
      quotes: [newQuote, ...db.quotes],
      meta: { ...db.meta, quoteCounter: counter },
    });
    setOpen(false);
    setProjectId("");
    setJobName("");
    router.push(`/quotes/${newQuote.id}/edit`);
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={FileText}
        title="Quotes"
        description="All quotes across all projects"
      />

      <PageActionCards>
        <PageActionCard
          icon={Plus}
          title="New Quote"
          description="Start a new quote for a project."
          buttonLabel="New Quote"
          onClick={() => setOpen(true)}
        />
        <PageActionCard
          icon={MapPin}
          title="Vendor map"
          description="Pick vendors on the map and add routes to quotes."
          buttonLabel="Open map"
          variant="outline"
          onClick={() => router.push("/vendor-map")}
        />
      </PageActionCards>

      <PageToolbar>
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="h-10 pl-9"
            placeholder="Search quotes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </PageToolbar>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 text-left font-medium">No.</th>
              <th className="px-4 py-3 text-left font-medium">Job Name</th>
              <th className="px-4 py-3 text-left font-medium">Project</th>
              <th className="px-4 py-3 text-left font-medium">Contractor</th>
              <th className="px-4 py-3 text-left font-medium">Total</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3 text-left font-medium">PDF</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No quotes yet — create one above.
                </td>
              </tr>
            )}
            {filtered.map((quote) => {
              const total = calcQuote(quote, db.meta).total;
              return (
                <tr
                  key={quote.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="font-mono text-xs text-gray-500 hover:text-[#0f6b4f]"
                    >
                      {quote.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/quotes/${quote.id}`} className="hover:text-[#0f6b4f]">
                      {quote.jobName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <Link href={`/projects/${quote.projectId}`} className="hover:text-[#0f6b4f]">
                      {quote.projectName || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{quote.contractorName || "—"}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {formatCurrency(total)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[quote.status]}`}
                    >
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(quote.createdAt)}</td>
                  <td className="px-4 py-3">
                    <QuotePdfButton quote={quote} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateFormSheet
        open={open}
        onOpenChange={setOpen}
        title="New Quote"
        description="Choose a project to start a new quote."
        submitLabel="Create & edit quote"
        onSubmit={createQuote}
        disabled={!projectId}
      >
        <FormSection title="Quote" description="Link this quote to a project">
          <FormField label="Project" required>
            <ProjectPickerField
              value={projectId}
              onChange={setProjectId}
              placeholder="Select project…"
              onProjectCreated={(p) => {
                if (!jobName) setJobName(p.name);
              }}
            />
          </FormField>
          <FormField label="Job name">
            <Input
              className="h-10"
              placeholder="Defaults to project name"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
            />
          </FormField>
        </FormSection>
      </CreateFormSheet>
    </div>
  );
}
