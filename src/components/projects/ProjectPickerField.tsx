"use client";

import { useState } from "react";
import { useDb } from "@/components/DbProvider";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ADD_NEW_PROJECT, sortProjectsByName } from "@/lib/projects";
import { Project } from "@/lib/types";
import { ProjectFormSheet } from "./ProjectFormSheet";

export function ProjectPickerField({
  value,
  onChange,
  placeholder = "Select project…",
  onProjectCreated,
}: {
  value: string;
  onChange: (projectId: string) => void;
  placeholder?: string;
  onProjectCreated?: (project: Project) => void;
}) {
  const { db } = useDb();
  const [showCreate, setShowCreate] = useState(false);
  const projects = sortProjectsByName(db.projects);

  function openCreate() {
    setShowCreate(true);
  }

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (id === ADD_NEW_PROJECT) {
      e.target.value = value;
      openCreate();
      return;
    }
    onChange(id);
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="h-9 w-full gap-1.5" onClick={openCreate}>
        <Plus className="h-4 w-4" />
        New Project
      </Button>
      <select
        className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
        value={value}
        onChange={handleSelect}
      >
        <option value="">{placeholder}</option>
        <option value={ADD_NEW_PROJECT}>+ Add new project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ProjectFormSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(project) => {
          onChange(project.id);
          onProjectCreated?.(project);
        }}
      />
    </div>
  );
}
