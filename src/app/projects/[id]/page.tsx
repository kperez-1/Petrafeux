"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen, Plus, Pencil } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatDate, formatCurrency, formatDueDate, generateId } from "@/lib/utils";
import { calcQuote } from "@/lib/quote-calc";
import { generateQuoteNumber, isRemote } from "@/lib/storage";
import { PROJECT_STAGES, Quote } from "@/lib/types";
import { setProjectStage } from "@/lib/projects";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DetailHeader } from "@/components/layout";
import { ActivitiesPanel } from "@/components/activities/ActivitiesPanel";
import { ProjectFormSheet } from "@/components/projects/ProjectFormSheet";
import { getActivitiesForProject } from "@/lib/activities";
import { ProjectEmailTab } from "@/components/projects/ProjectEmailTab";
import { ProjectBiddersPanel } from "@/components/projects/ProjectBiddersPanel";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-yellow-100 text-yellow-800 border-yellow-200",
  unsent: "bg-gray-100 text-gray-600 border-gray-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading project…</div>}>
      <ProjectDetailPageContent params={params} />
    </Suspense>
  );
}

function ProjectDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, save } = useDb();
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "email" ? "email" : "quotes";
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function createQuote() {
    if (!project) return;
    setCreatingQuote(true);
    const counter = (db.meta?.quoteCounter ?? 0) + 1;
    const newQuote: Quote = {
      id: generateId(),
      projectId: project.id,
      projectName: project.name,
      number: generateQuoteNumber(counter),
      jobName: project.name,
      status: "unsent",
      taxRate: db.meta.defaultTaxRate ?? 7,
      routes: [],
      createdAt: new Date().toISOString(),
      history: [
        {
          id: generateId(),
          type: "created",
          at: new Date().toISOString(),
        },
      ],
    };
    await save({
      ...db,
      quotes: [newQuote, ...db.quotes],
      meta: { ...db.meta, quoteCounter: counter },
    });
    router.push(`/quotes/${newQuote.id}/edit`);
  }

  // project is used in createQuote — must be declared before hooks
  const project = db.projects.find((p) => p.id === id);
  const quotes = db.quotes.filter((q) => q.projectId === id);

  if (!project) {
    return (
      <div className="p-8 text-gray-400">
        Project not found. <Link href="/projects" className="text-[#0f6b4f] underline">Back to projects</Link>
      </div>
    );
  }

  const projectActivities = getActivitiesForProject(db, project.id);

  return (
    <div className="p-8">
      <DetailHeader
        backHref="/projects/dashboard"
        icon={FolderOpen}
        title={project.name}
        description={`${quotes.length} quote${quotes.length !== 1 ? "s" : ""}${project.address ? ` · ${project.address}` : ""}${project.intakeDueDate ? ` · Due ${formatDueDate(project.intakeDueDate)}` : ""} · Created ${formatDate(project.createdAt)}`}
      />

      <div className="mb-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit project
        </Button>
      </div>

      <ProjectFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
      />

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Stage</label>
          <select
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
            value={project.stage ?? "new"}
            onChange={async (e) => {
              const updated = setProjectStage(project, e.target.value as import("@/lib/types").ProjectStage);
              await save({
                ...db,
                projects: db.projects.map((p) => (p.id === id ? updated : p)),
              });
            }}
          >
            {PROJECT_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Office</label>
          <select
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
            value={project.officeId ?? ""}
            onChange={async (e) => {
              const officeId = e.target.value || undefined;
              await save({
                ...db,
                projects: db.projects.map((p) =>
                  p.id === id
                    ? { ...p, officeId, updatedAt: new Date().toISOString() }
                    : p
                ),
              });
            }}
          >
            <option value="">—</option>
            {db.offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Salesperson</label>
          <select
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
            value={project.salespersonId ?? ""}
            onChange={async (e) => {
              const salespersonId = e.target.value || undefined;
              await save({
                ...db,
                projects: db.projects.map((p) =>
                  p.id === id
                    ? { ...p, salespersonId, updatedAt: new Date().toISOString() }
                    : p
                ),
              });
            }}
          >
            <option value="">—</option>
            {db.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        {project.archived && (
          <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600">
            Archived
          </span>
        )}
      </div>

      <ProjectBiddersPanel project={project} />

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="border-b border-gray-200 bg-transparent p-0 h-auto mb-6">
          <TabsTrigger
            value="quotes"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-0 text-sm data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Quotes
          </TabsTrigger>
          <TabsTrigger
            value="activities"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-0 text-sm data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Activities
          </TabsTrigger>
          {!isRemote() && (
            <TabsTrigger
              value="email"
              className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-0 text-sm data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Email
            </TabsTrigger>
          )}
          <TabsTrigger
            value="orders"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-0 text-sm data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quotes">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Quotes</h2>
            <Button
              size="sm"
              className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1"
              onClick={createQuote}
              disabled={creatingQuote}
            >
              <Plus className="h-4 w-4" /> New Quote
            </Button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-medium">No.</th>
                  <th className="px-4 py-3 text-left font-medium">Job Name</th>
                  <th className="px-4 py-3 text-left font-medium">Contractor</th>
                  <th className="px-4 py-3 text-left font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {quotes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No quotes yet — create one above.
                    </td>
                  </tr>
                )}
                {quotes.map((quote) => {
                  const total = calcQuote(quote, db.meta).total;
                  return (
                    <tr key={quote.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/quotes/${quote.id}`} className="font-mono text-xs text-gray-500 hover:text-[#0f6b4f]">
                          {quote.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link href={`/quotes/${quote.id}`} className="hover:text-[#0f6b4f]">
                          {quote.jobName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{quote.contractorName || "—"}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(total)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[quote.status]}`}>
                          {quote.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(quote.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="activities">
          <ActivitiesPanel
            activities={projectActivities}
            createDefaults={{ projectId: project.id }}
          />
        </TabsContent>

        {!isRemote() && (
          <TabsContent value="email">
            <ProjectEmailTab db={db} project={project} />
          </TabsContent>
        )}

        <TabsContent value="orders">
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">
            Orders coming soon.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
