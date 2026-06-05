import { generateId } from "./utils";
import type { Db, Project, ProjectBidder, ProjectBidderStatus } from "./types";

function companyKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function getBiddersForProject(db: Db, projectId: string): ProjectBidder[] {
  return db.projectBidders
    .filter((b) => b.projectId === projectId)
    .sort((a, b) => a.company.localeCompare(b.company));
}

export function findBidderByCompany(
  db: Db,
  projectId: string,
  company: string
): ProjectBidder | undefined {
  const key = companyKey(company);
  return db.projectBidders.find(
    (b) => b.projectId === projectId && companyKey(b.company) === key
  );
}

export function ensureProjectBidder(
  db: Db,
  projectId: string,
  company: string,
  contractorId?: string,
  status: ProjectBidderStatus = "proposal_requested"
): Db {
  const trimmed = company.trim();
  if (!trimmed) return db;

  const existing = findBidderByCompany(db, projectId, trimmed);
  if (existing) {
    const needsUpdate =
      (contractorId && existing.contractorId !== contractorId) ||
      existing.status !== status;
    if (!needsUpdate) return db;
    return {
      ...db,
      projectBidders: db.projectBidders.map((b) =>
        b.id === existing.id
          ? {
              ...b,
              contractorId: contractorId ?? b.contractorId,
              status,
              updatedAt: new Date().toISOString(),
            }
          : b
      ),
    };
  }

  const bidder: ProjectBidder = {
    id: generateId(),
    projectId,
    company: trimmed,
    contractorId,
    status,
    updatedAt: new Date().toISOString(),
  };

  return { ...db, projectBidders: [...db.projectBidders, bidder] };
}

export function ensureBidderFromProjectSource(db: Db, project: Project): Db {
  if (!project.sourceCompany?.trim()) return db;
  return ensureProjectBidder(
    db,
    project.id,
    project.sourceCompany,
    project.sourceContractorId,
    "proposal_requested"
  );
}

export function getProjectsForBidderCompany(db: Db, companyName: string): Project[] {
  const key = companyKey(companyName);
  const projectIds = new Set(
    db.projectBidders
      .filter((b) => companyKey(b.company) === key)
      .map((b) => b.projectId)
  );
  return db.projects.filter((p) => projectIds.has(p.id));
}
