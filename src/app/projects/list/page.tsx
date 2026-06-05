"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderOpen, Search, Plus, LayoutGrid } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatDate } from "@/lib/utils";
import {
  PageHeader,
  PageActionCards,
  PageActionCard,
  PageToolbar,
} from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProjectFormSheet } from "@/components/projects/ProjectFormSheet";
import { PROJECT_STAGES } from "@/lib/types";

export default function ProjectsListPage() {
  const { db } = useDb();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = db.projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function stageLabel(stage?: string) {
    return PROJECT_STAGES.find((s) => s.value === stage)?.label ?? "New";
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={FolderOpen}
        title="All Projects"
        description="Table view of all projects"

      >
        <Link href="/projects/dashboard">
          <Button variant="outline" size="sm" className="gap-1">
            <LayoutGrid className="h-4 w-4" />
            CRM board
          </Button>
        </Link>
      </PageHeader>

      <PageActionCards>
        <PageActionCard
          icon={Plus}
          title="New Project"
          description="Create a new project."
          buttonLabel="New Project"
          onClick={() => setOpen(true)}
        />
      </PageActionCards>

      <PageToolbar>
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="h-10 pl-9"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </PageToolbar>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Stage</th>
              <th className="px-4 py-3 text-left font-medium">Address</th>
              <th className="px-4 py-3 text-left font-medium">Quotes</th>
              <th className="px-4 py-3 text-left font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No projects yet.
                </td>
              </tr>
            )}
            {filtered.map((project) => {
              const quoteCount = db.quotes.filter((q) => q.projectId === project.id).length;
              return (
                <tr
                  key={project.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium text-gray-900 hover:text-[#0f6b4f]"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{stageLabel(project.stage)}</td>
                  <td className="px-4 py-3 text-gray-500">{project.address || "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{quoteCount}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(project.updatedAt ?? project.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ProjectFormSheet open={open} onOpenChange={setOpen} onCreated={() => {}} />
    </div>
  );
}
