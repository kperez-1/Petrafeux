import { Contractor, Db, Project } from "../types";
import type { IntakeMatchPreview, ParsedEmailIntake } from "./types";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function findContractorByEmail(db: Db, email: string): Contractor | undefined {
  const e = email.trim().toLowerCase();
  if (!e) return undefined;
  return db.contractors.find((c) => c.email.trim().toLowerCase() === e);
}

export function findContractorsByCompany(db: Db, company: string): Contractor[] {
  const key = norm(company);
  if (!key) return [];
  return db.contractors.filter((c) => norm(c.company) === key);
}

export function findProjectByName(db: Db, name: string): Project | undefined {
  const key = norm(name);
  if (!key) return undefined;
  return db.projects.find((p) => norm(p.name) === key || norm(p.name).includes(key) || key.includes(norm(p.name)));
}

export function buildMatchPreview(db: Db, parsed: ParsedEmailIntake): IntakeMatchPreview {
  const email = parsed.signature.email || parsed.from.email;
  const company = parsed.signature.company || "";
  const byEmail = findContractorByEmail(db, email);
  const byCompany = findContractorsByCompany(db, company);
  const byProject = findProjectByName(db, parsed.project.name);

  const contractor = byEmail ?? byCompany[0];
  const companyName = contractor?.company ?? company;

  return {
    contractorId: contractor?.id,
    companyName,
    projectId: byProject?.id,
    willCreateCompany: !byCompany.length && !!company.trim(),
    willCreateContractor: !contractor && !!email,
    willCreateProject: !byProject,
  };
}
