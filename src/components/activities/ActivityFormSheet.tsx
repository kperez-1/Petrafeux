"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Activity, ActivityStatus, ActivityType } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { uniqueCompanies, contactsForCompany } from "@/lib/activities";
import { ProjectPickerField } from "@/components/projects/ProjectPickerField";

export type ActivityFormDefaults = {
  status?: ActivityStatus;
  projectId?: string;
  contractorId?: string;
  company?: string;
};

export function ActivityFormSheet({
  open,
  onOpenChange,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: ActivityFormDefaults;
}) {
  const { db, save } = useDb();
  const [status, setStatus] = useState<ActivityStatus>("scheduled");
  const [type, setType] = useState<ActivityType>("call");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [company, setCompany] = useState("");
  const [contractorId, setContractorId] = useState("");

  const companies = uniqueCompanies(db.contractors);
  const companyContacts = company ? contactsForCompany(db.contractors, company) : [];

  useEffect(() => {
    if (!open) return;
    const preset = defaults?.status ?? "scheduled";
    setStatus(preset);
    setType("call");
    setSubject("");
    setNotes("");
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setScheduledAt(now.toISOString().slice(0, 16));
    setProjectId(defaults?.projectId ?? "");
    setCompany(defaults?.company ?? "");
    setContractorId(defaults?.contractorId ?? "");
  }, [open, defaults]);

  async function submit() {
    if (!subject.trim() || !scheduledAt) return;
    const now = new Date().toISOString();
    const activity: Activity = {
      id: generateId(),
      type,
      status,
      subject: subject.trim(),
      notes: notes.trim() || undefined,
      scheduledAt: new Date(scheduledAt).toISOString(),
      completedAt: status === "completed" ? now : undefined,
      projectId: projectId || undefined,
      contractorId: contractorId || undefined,
      company: company.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    await save({ ...db, activities: [activity, ...db.activities] });
    onOpenChange(false);
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={status === "completed" ? "Log activity" : "Schedule activity"}
      description={
        status === "completed"
          ? "Record a completed call, meeting, or jobsite visit."
          : "Plan a future call, meeting, or jobsite visit."
      }
      submitLabel={status === "completed" ? "Log activity" : "Schedule activity"}
      onSubmit={submit}
      disabled={!subject.trim() || !scheduledAt}
    >
      <FormSection title="Activity" description="What happened or will happen">
        <FormField label="Type" required>
          <select
            className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as ActivityType)}
          >
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
            <option value="jobsite_visit">Jobsite visit</option>
          </select>
        </FormField>
        <FormField label="Subject" required>
          <Input
            className="h-10"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary"
          />
        </FormField>
        <FormField label="When" required>
          <Input
            type="datetime-local"
            className="h-10"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </FormField>
        <FormField label="Notes">
          <textarea
            className="min-h-[80px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional details"
          />
        </FormField>
      </FormSection>
      <FormSection title="Related to" description="Link to a job, company, or contact">
        <FormField label="Project (job)">
          <ProjectPickerField
            value={projectId}
            onChange={setProjectId}
            placeholder="None"
          />
        </FormField>
        <FormField label="Company">
          <select
            className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setContractorId("");
            }}
          >
            <option value="">None</option>
            {companies.map((co) => (
              <option key={co} value={co}>
                {co}
              </option>
            ))}
          </select>
        </FormField>
        {company && (
          <FormField label="Contact">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
            >
              <option value="">Company only</option>
              {companyContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </FormSection>
    </CreateFormSheet>
  );
}
