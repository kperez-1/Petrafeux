import { Contractor, Db, Project, Quote } from "./types";

export interface CompanySummary {
  slug: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  ein?: string;
  contactsCount: number;
  projectsCount: number;
}

export function companySlug(name: string): string {
  return encodeURIComponent(name.trim());
}

export function parseCompanySlug(slug: string): string {
  return decodeURIComponent(slug);
}

function companyKey(contractor: Contractor): string {
  return contractor.company.trim() || "Unassigned";
}

export function getContactsForCompany(db: Db, companyName: string): Contractor[] {
  const key = companyName.trim();
  return db.contractors.filter((c) => companyKey(c) === key);
}

export function getProjectsForCompany(db: Db, companyName: string): Project[] {
  const contacts = getContactsForCompany(db, companyName);
  const contactIds = new Set(contacts.map((c) => c.id));
  const projectIds = new Set<string>();

  for (const q of db.quotes) {
    if (q.contractorId && contactIds.has(q.contractorId)) {
      projectIds.add(q.projectId);
    }
  }

  const key = companyName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const b of db.projectBidders ?? []) {
    if (b.company.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === key) {
      projectIds.add(b.projectId);
    }
  }

  return db.projects.filter((p) => projectIds.has(p.id));
}

export function getQuotesForCompany(db: Db, companyName: string): Quote[] {
  const contacts = getContactsForCompany(db, companyName);
  const contactIds = new Set(contacts.map((c) => c.id));
  return db.quotes.filter((q) => q.contractorId && contactIds.has(q.contractorId));
}

export function buildCompanySummaries(db: Db): CompanySummary[] {
  const groups = new Map<string, Contractor[]>();

  for (const c of db.contractors) {
    const key = companyKey(c);
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const summaries: CompanySummary[] = [];

  for (const [name, contacts] of groups) {
    const primary =
      contacts.find((c) => c.company.trim() === name) ?? contacts[0];
    const projectIds = new Set<string>();
    const contactIds = new Set(contacts.map((c) => c.id));
    for (const q of db.quotes) {
      if (q.contractorId && contactIds.has(q.contractorId)) {
        projectIds.add(q.projectId);
      }
    }
    const companyNorm = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const b of db.projectBidders ?? []) {
      if (b.company.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === companyNorm) {
        projectIds.add(b.projectId);
      }
    }

    summaries.push({
      slug: companySlug(name),
      name,
      address: primary?.address ?? "",
      phone: primary?.phone ?? contacts.find((c) => c.phone)?.phone ?? "",
      email: primary?.email ?? contacts.find((c) => c.email)?.email ?? "",
      ein: contacts.find((c) => c.ein)?.ein,
      contactsCount: contacts.length,
      projectsCount: projectIds.size,
    });
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export function findCompanySummary(
  db: Db,
  companyName: string
): CompanySummary | undefined {
  return buildCompanySummaries(db).find((s) => s.name === companyName);
}

export {
  findContractorByEmail,
  findContractorsByCompany as findContactsByCompany,
  findProjectByName,
} from "./email-intake/match-contractor";
