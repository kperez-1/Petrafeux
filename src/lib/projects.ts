import { Project, ProjectStage } from "./types";
import { generateId } from "./utils";
import { normalizeProjectStage } from "./db-defaults";

export const ADD_NEW_PROJECT = "__new_project__";

export function buildNewProject(fields: {
  name: string;
  address?: string;
  description?: string;
  officeId?: string;
  salespersonId?: string;
  stage?: ProjectStage;
}): Project {
  const now = new Date().toISOString();
  const stage = normalizeProjectStage(fields.stage);
  return {
    id: generateId(),
    name: fields.name.trim(),
    address: (fields.address ?? "").trim(),
    description: (fields.description ?? "").trim(),
    createdAt: now,
    updatedAt: now,
    stage,
    archived: stage === "closed_lost",
    officeId: fields.officeId,
    salespersonId: fields.salespersonId,
  };
}

export function setProjectStage(project: Project, stage: ProjectStage): Project {
  const archived = stage === "closed_lost";
  return {
    ...project,
    stage,
    archived,
    updatedAt: new Date().toISOString(),
  };
}

export function sortProjectsByName(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => a.name.localeCompare(b.name));
}
