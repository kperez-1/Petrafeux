"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/DbProvider";
import { useActiveOffice } from "@/components/ActiveOfficeProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Project } from "@/lib/types";
import { buildNewProject } from "@/lib/projects";
import { resolveCurrentUser } from "@/lib/current-user";

export function ProjectFormSheet({
  open,
  onOpenChange,
  project,
  onCreated,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
  onCreated?: (project: Project) => void;
  onSaved?: (project: Project) => void;
}) {
  const { db, save } = useDb();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");

  const currentUser = resolveCurrentUser(db);
  const { officeId: activeOfficeId } = useActiveOffice();
  const salespeople = db.users.filter((u) => u.role === "salesperson" || u.role === "admin");

  const isEdit = Boolean(project);

  useEffect(() => {
    if (!open) return;
    if (project) {
      setName(project.name);
      setAddress(project.address ?? "");
      setDescription(project.description ?? "");
      setOfficeId(project.officeId ?? "");
      setSalespersonId(project.salespersonId ?? "");
    } else {
      setName("");
      setAddress("");
      setDescription("");
      setOfficeId(activeOfficeId);
      setSalespersonId(currentUser?.id ?? "");
    }
  }, [open, project, currentUser, activeOfficeId]);

  async function submit() {
    if (!name.trim()) return;
    if (project) {
      const updated: Project = {
        ...project,
        name: name.trim(),
        address: address.trim(),
        description: description.trim(),
        officeId: officeId || undefined,
        salespersonId: salespersonId || undefined,
        updatedAt: new Date().toISOString(),
      };
      await save({
        ...db,
        projects: db.projects.map((p) => (p.id === project.id ? updated : p)),
        quotes: db.quotes.map((q) =>
          q.projectId === project.id ? { ...q, projectName: updated.name } : q
        ),
      });
      onSaved?.(updated);
    } else {
      const created = buildNewProject({
        name,
        address,
        description,
        officeId: officeId || undefined,
        salespersonId: salespersonId || undefined,
      });
      await save({ ...db, projects: [created, ...db.projects] });
      onCreated?.(created);
    }
    onOpenChange(false);
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit project" : "New Project"}
      description={
        isEdit
          ? "Update project name, location, and assignment."
          : "Create a project and link it to an office and salesperson."
      }
      submitLabel={isEdit ? "Save changes" : "Create Project"}
      onSubmit={submit}
      disabled={!name.trim()}
    >
      <FormSection title="General" description="Basic project identification and location">
        <FormField label="Project name" required>
          <Input
            className="h-10"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="Address">
          <Input
            className="h-10"
            placeholder="Project address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            placeholder="Project description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </FormField>
        {db.offices.length > 0 && (
          <FormField label="Office">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
            >
              <option value="">None</option>
              {db.offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {salespeople.length > 0 && (
          <FormField label="Salesperson">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={salespersonId}
              onChange={(e) => setSalespersonId(e.target.value)}
            >
              <option value="">None</option>
              {salespeople.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </FormSection>
    </CreateFormSheet>
  );
}
