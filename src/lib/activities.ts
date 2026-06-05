import { Activity, Contractor, Db, Project, Quote } from "./types";

export const ACTIVITY_TYPE_LABELS: Record<Activity["type"], string> = {
  call: "Call",
  meeting: "Meeting",
  jobsite_visit: "Jobsite visit",
};

export function sortActivities(list: Activity[]): Activity[] {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === "scheduled" ? -1 : 1;
    const ta = new Date(a.scheduledAt).getTime();
    const tb = new Date(b.scheduledAt).getTime();
    return a.status === "scheduled" ? ta - tb : tb - ta;
  });
}

export function getActivitiesForProject(db: Db, projectId: string): Activity[] {
  return sortActivities(db.activities.filter((a) => a.projectId === projectId));
}

export function getActivitiesForContact(db: Db, contractorId: string): Activity[] {
  return sortActivities(db.activities.filter((a) => a.contractorId === contractorId));
}

export function getActivitiesForCompany(db: Db, companyName: string): Activity[] {
  const key = companyName.trim().toLowerCase();
  const contactIds = new Set(
    db.contractors
      .filter((c) => c.company.trim().toLowerCase() === key)
      .map((c) => c.id)
  );
  return sortActivities(
    db.activities.filter(
      (a) =>
        (a.company && a.company.trim().toLowerCase() === key) ||
        (a.contractorId && contactIds.has(a.contractorId))
    )
  );
}

export function getActivitiesForQuote(db: Db, quote: Quote): Activity[] {
  const ids = new Set<string>();
  const list: Activity[] = [];
  for (const a of db.activities) {
    if (a.projectId === quote.projectId || a.contractorId === quote.contractorId) {
      if (!ids.has(a.id)) {
        ids.add(a.id);
        list.push(a);
      }
    }
  }
  return sortActivities(list);
}

export function activityRelationLabel(
  db: Db,
  activity: Activity
): string {
  const parts: string[] = [];
  if (activity.projectId) {
    const p = db.projects.find((x) => x.id === activity.projectId);
    parts.push(p ? `Job: ${p.name}` : "Job");
  }
  if (activity.company) parts.push(activity.company);
  if (activity.contractorId) {
    const c = db.contractors.find((x) => x.id === activity.contractorId);
    if (c) {
      const name = `${c.firstName} ${c.lastName}`.trim();
      if (name) parts.push(name);
    }
  }
  return parts.length ? parts.join(" · ") : "—";
}

export function uniqueCompanies(contractors: Contractor[]): string[] {
  const set = new Set<string>();
  for (const c of contractors) {
    if (c.company.trim()) set.add(c.company.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function contactsForCompany(contractors: Contractor[], company: string): Contractor[] {
  const key = company.trim().toLowerCase();
  return contractors.filter((c) => c.company.trim().toLowerCase() === key);
}

export function formatActivityWhen(activity: Activity): string {
  const d = new Date(activity.scheduledAt);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (activity.status === "completed" && activity.completedAt) {
    return `${date} ${time} (completed)`;
  }
  return `${date} ${time}`;
}
