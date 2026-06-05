import { generateId } from "../utils";
import type {
  Contractor,
  Db,
  EmailAttachment,
  Project,
  ProjectEmailIntake,
} from "../types";
import type { IntakeApplyPayload, ParsedEmailIntake } from "./types";
import { findContractorByEmail } from "./match-contractor";
import { ensureProjectBidder } from "../project-bidders";

export interface ApplyIntakeResult {
  project: Project;
  contractor: Contractor;
  intake: ProjectEmailIntake;
  attachments: EmailAttachment[];
  createdProject: boolean;
  createdContractor: boolean;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function applyEmailIntake(
  db: Db,
  parsed: ParsedEmailIntake,
  payload: IntakeApplyPayload,
  attachmentMeta: { fileName: string; storageKey: string; size: number; mimeType: string }[],
  receivedAt?: string
): ApplyIntakeResult {
  const now = new Date().toISOString();
  let contractor: Contractor | undefined;
  let createdContractor = false;

  if (payload.useExistingContractorId) {
    contractor = db.contractors.find((c) => c.id === payload.useExistingContractorId);
  }
  if (!contractor && payload.contactEmail) {
    contractor = findContractorByEmail(db, payload.contactEmail);
  }
  if (!contractor) {
    const { firstName, lastName } = splitName(
      `${payload.firstName} ${payload.lastName}`.trim() || parsed.signature.name
    );
    contractor = {
      id: generateId(),
      firstName: payload.firstName.trim() || firstName,
      lastName: payload.lastName.trim() || lastName,
      company: payload.company.trim(),
      email: payload.contactEmail.trim().toLowerCase(),
      phone: payload.contactPhone.trim(),
      address: payload.contactAddress.trim(),
      officeId: payload.officeId,
      salespersonId: payload.salespersonId,
    };
    createdContractor = true;
  } else {
    contractor = {
      ...contractor,
      company: payload.company.trim() || contractor.company,
      phone: payload.contactPhone.trim() || contractor.phone,
      address: payload.contactAddress.trim() || contractor.address,
    };
  }

  let project: Project | undefined;
  let createdProject = false;

  if (payload.linkExistingProjectId) {
    project = db.projects.find((p) => p.id === payload.linkExistingProjectId);
  }
  if (!project) {
    project = {
      id: generateId(),
      name: payload.projectName.trim(),
      address: payload.projectAddress.trim(),
      description: payload.projectDescription?.trim() ?? "",
      createdAt: now,
      updatedAt: now,
      stage: "new",
      officeId: payload.officeId,
      salespersonId: payload.salespersonId,
      sourceCompany: payload.company.trim(),
      sourceContractorId: contractor.id,
      intakeDueDate: payload.intakeDueDate,
    };
    createdProject = true;
  } else {
    project = {
      ...project,
      sourceCompany: project.sourceCompany ?? payload.company.trim(),
      sourceContractorId: project.sourceContractorId ?? contractor.id,
      intakeDueDate: payload.intakeDueDate ?? project.intakeDueDate,
      updatedAt: now,
    };
  }

  const intakeId = generateId();
  const attachmentIds: string[] = [];
  const attachments: EmailAttachment[] = attachmentMeta.map((a) => {
    const id = generateId();
    attachmentIds.push(id);
    return {
      id,
      intakeId,
      projectId: project!.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      storageKey: a.storageKey,
    };
  });

  const intake: ProjectEmailIntake = {
    id: intakeId,
    projectId: project.id,
    company: payload.company.trim(),
    contractorId: contractor.id,
    receivedAt: receivedAt ?? now,
    subject: parsed.subject,
    fromName: parsed.from.name,
    fromEmail: parsed.from.email,
    bodyText: parsed.bodyText,
    bodyHtml: parsed.bodyHtml,
    signatureText: JSON.stringify(parsed.signature),
    isForwarded: parsed.isForwarded,
    attachmentIds,
  };

  return {
    project,
    contractor,
    intake,
    attachments,
    createdProject,
    createdContractor,
  };
}

export function mergeApplyIntoDb(
  db: Db,
  result: ApplyIntakeResult
): Db {
  let contractors = db.contractors;
  if (result.createdContractor) {
    contractors = [...contractors, result.contractor];
  } else {
    contractors = contractors.map((c) =>
      c.id === result.contractor.id ? result.contractor : c
    );
  }

  let projects = db.projects;
  if (result.createdProject) {
    projects = [...projects, result.project];
  } else {
    projects = projects.map((p) => (p.id === result.project.id ? result.project : p));
  }

  let next: Db = {
    ...db,
    contractors,
    projects,
    emailIntakes: [...db.emailIntakes, result.intake],
    emailAttachments: [...db.emailAttachments, ...result.attachments],
  };
  next = ensureProjectBidder(
    next,
    result.project.id,
    result.contractor.company,
    result.contractor.id,
    "proposal_requested"
  );
  return next;
}
