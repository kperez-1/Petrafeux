"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { IntakeApplyPayload, IntakeMatchPreview, ParsedEmailIntake } from "@/lib/email-intake/types";
import { mergeApplyIntoDb, type ApplyIntakeResult } from "@/lib/email-intake/apply-intake";
import { companySlug } from "@/lib/contractors";
import { resolveCurrentUser } from "@/lib/current-user";
import { useActiveOffice } from "@/components/ActiveOfficeProvider";
import { toDateInputValue, todayDateInputValue } from "@/lib/utils";

export function EmailIntakeReviewSheet({
  open,
  onOpenChange,
  sessionId,
  parsed,
  matches,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  parsed: ParsedEmailIntake;
  matches: IntakeMatchPreview;
}) {
  const { db, save } = useDb();
  const router = useRouter();
  const currentUser = resolveCurrentUser(db);
  const { officeId: activeOfficeId } = useActiveOffice();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [company, setCompany] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [intakeDueDate, setIntakeDueDate] = useState("");
  const [linkExistingProjectId, setLinkExistingProjectId] = useState("");
  const [useExistingContractorId, setUseExistingContractorId] = useState("");

  useEffect(() => {
    if (!open) return;
    const sig = parsed.signature;
    const nameParts = (sig.name || "").trim().split(/\s+/);
    setCompany(matches.companyName ?? sig.company ?? "");
    setFirstName(nameParts[0] ?? "");
    setLastName(nameParts.slice(1).join(" "));
    setContactEmail(sig.email || parsed.from.email);
    setContactPhone(sig.phone ?? "");
    setContactAddress(sig.address ?? "");
    setProjectName(parsed.project.name);
    setProjectAddress(
      parsed.project.address ||
        (parsed.project.addressHint ? `${parsed.project.addressHint} (verify jobsite)` : "")
    );
    setProjectDescription(parsed.project.descriptionSnippet ?? "");
    setIntakeDueDate(toDateInputValue(parsed.project.dueDate));
    setLinkExistingProjectId(matches.projectId ?? "");
    setUseExistingContractorId(matches.contractorId ?? "");
    setError(null);
  }, [open, parsed, matches]);

  async function submit() {
    if (!projectName.trim()) return;
    setApplying(true);
    setError(null);
    try {
      const payload: IntakeApplyPayload = {
        sessionId,
        company: company.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        contactAddress: contactAddress.trim(),
        projectName: projectName.trim(),
        projectAddress: projectAddress.trim(),
        projectDescription: projectDescription.trim() || undefined,
        intakeDueDate: intakeDueDate.trim() || undefined,
        officeId: activeOfficeId,
        salespersonId: currentUser?.id,
        linkExistingProjectId: linkExistingProjectId || undefined,
        useExistingContractorId: useExistingContractorId || undefined,
      };

      const res = await fetch("/api/email-intake/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Apply failed");

      const serverResult: ApplyIntakeResult = {
        project: data.project,
        contractor: data.contractor,
        intake: data.intake,
        attachments: data.attachments,
        createdProject: data.createdProject,
        createdContractor: data.createdContractor,
      };

      const nextDb = mergeApplyIntoDb(db, serverResult);
      await save(nextDb);
      onOpenChange(false);
      router.push(`/projects/${data.projectId}?tab=email`);
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  }

  const existingProject = linkExistingProjectId
    ? db.projects.find((p) => p.id === linkExistingProjectId)
    : undefined;

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Review email intake"
      description={parsed.subject || "Outlook message"}
      submitLabel={applying ? "Saving…" : linkExistingProjectId ? "Link to project" : "Create project"}
      onSubmit={submit}
      disabled={applying || !projectName.trim()}
    >
      {parsed.isForwarded && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Forwarded email — customer resolved from the original external sender
          {parsed.originalSender?.email ? ` (${parsed.originalSender.email})` : ""}.
        </div>
      )}

      {(matches.projectId || matches.contractorId) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {matches.projectId && (
            <p>
              Matching project found. Link to existing to avoid a duplicate, or clear the selection
              below to create a new project.
            </p>
          )}
          {matches.contractorId && !matches.projectId && (
            <p>Existing contact matched by email or company.</p>
          )}
        </div>
      )}

      <FormSection
        title="Company & contact"
        description="Matched from email signature; company address is for the contact record only."
      >
        <FormField label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </FormField>
        {company && (
          <p className="text-xs text-gray-500">
            <Link
              href={`/contractors/${companySlug(company)}`}
              className="text-[#0f6b4f] underline"
              target="_blank"
            >
              View company
            </Link>
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </FormField>
          <FormField label="Last name">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Email">
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </FormField>
        <FormField label="Phone">
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </FormField>
        <FormField label="Company address (contact only)">
          <Input value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} />
        </FormField>
        {matches.contractorId && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={!!useExistingContractorId}
              onChange={(e) =>
                setUseExistingContractorId(e.target.checked ? matches.contractorId! : "")
              }
            />
            Use existing contact
          </label>
        )}
      </FormSection>

      <FormSection
        title="Project"
        description="Project name and jobsite come from the email subject and body, not the signature."
      >
        <FormField label="Project name">
          <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        </FormField>
        <FormField label="Jobsite address">
          <Input value={projectAddress} onChange={(e) => setProjectAddress(e.target.value)} />
        </FormField>
        <FormField label="Due date">
          <Input
            type="date"
            min={todayDateInputValue()}
            value={intakeDueDate}
            onChange={(e) => setIntakeDueDate(e.target.value)}
          />
        </FormField>
        <FormField label="Notes">
          <Textarea
            rows={3}
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
          />
        </FormField>
        {matches.projectId && (
          <FormField label="Link to existing project">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={linkExistingProjectId}
              onChange={(e) => setLinkExistingProjectId(e.target.value)}
            >
              <option value="">Create new project</option>
              {db.projects
                .filter((p) => p.id === matches.projectId || normMatch(p.name, projectName))
                .slice(0, 20)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            {existingProject && (
              <p className="mt-1 text-xs text-gray-500">
                Will add email record to{" "}
                <Link href={`/projects/${existingProject.id}`} className="text-[#0f6b4f] underline">
                  {existingProject.name}
                </Link>
              </p>
            )}
          </FormField>
        )}
      </FormSection>

      {parsed.attachmentNames.length > 0 && (
        <FormSection title="Attachments" description="Files saved with the project after you apply.">
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            {parsed.attachmentNames.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </FormSection>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </CreateFormSheet>
  );
}

function normMatch(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const na = n(a);
  const nb = n(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}
