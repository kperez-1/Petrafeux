"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderOpen, Plus, Search } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { generateId, formatDate } from "@/lib/utils";
import { Project } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ProjectsPage() {
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", description: "" });

  const filtered = db.projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  async function createProject() {
    if (!form.name.trim()) return;
    const project: Project = {
      id: generateId(),
      name: form.name.trim(),
      address: form.address.trim(),
      description: form.description.trim(),
      createdAt: new Date().toISOString(),
    };
    await save({ ...db, projects: [project, ...db.projects] });
    setForm({ name: "", address: "", description: "" });
    setOpen(false);
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
          <FolderOpen className="h-6 w-6 text-gray-500" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500">Manage your projects, quotes, and job details</p>
        </div>
      </div>

      {/* New Project card */}
      <div
        onClick={() => setOpen(true)}
        className="mb-6 cursor-pointer rounded-xl border border-dashed border-gray-300 bg-white p-6 hover:border-gray-400 hover:bg-gray-50 transition-colors max-w-2xl"
      >
        <div className="flex items-center gap-2 text-gray-600 mb-1">
          <Plus className="h-4 w-4" />
          <span className="font-medium">New Project</span>
        </div>
        <p className="text-sm text-gray-400">Create a new project and start adding quotes to it.</p>
        <Button
          className="mt-4 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >
          New Project
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Address</th>
              <th className="px-4 py-3 text-left font-medium">Quotes</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No projects yet — create one above.
                </td>
              </tr>
            )}
            {filtered.map((project) => {
              const quoteCount = db.quotes.filter((q) => q.projectId === project.id).length;
              return (
                <tr key={project.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${project.id}`} className="font-medium text-gray-900 hover:text-[#0f6b4f]">
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{project.address || "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{quoteCount}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(project.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New Project drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[420px]">
          <SheetHeader>
            <SheetTitle>New Project</SheetTitle>
            <p className="text-sm text-gray-500">Create a new project.</p>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">General</p>
              <p className="mb-4 text-sm text-gray-500">Basic project identification and location</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Project Name <span className="text-red-500">*</span></label>
              <Input
                placeholder="Project name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="border-[#0f6b4f] focus-visible:ring-[#0f6b4f]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <Input
                placeholder="Project address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Description</label>
              <Textarea
                placeholder="Project description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
              />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex gap-3 border-t border-gray-200 bg-white p-4">
            <Button
              className="flex-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white"
              onClick={createProject}
              disabled={!form.name.trim()}
            >
              Create Project
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
