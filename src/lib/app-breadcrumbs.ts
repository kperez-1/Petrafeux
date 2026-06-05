import { Db } from "./types";

export type BreadcrumbItem = { label: string; href?: string };

const STATIC_LABELS: Record<string, string> = {
  contractors: "Contractors",
  vendors: "Vendors",
  materials: "Materials",
  "haul-rates": "Haul Rates",
  "vendor-map": "Dispatch Map",
  settings: "Settings",
  activities: "Activities",
  quotes: "Quotes",
};

export function buildAppBreadcrumbs(pathname: string, db: Db): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [{ label: "Home" }];
  }

  const [root, second, third, fourth] = segments;

  if (root === "projects") {
    if (second === "dashboard" || !second) {
      return [{ label: "Projects" }];
    }
    if (second === "list") {
      return [
        { label: "Projects", href: "/projects/dashboard" },
        { label: "All projects" },
      ];
    }
    const project = db.projects.find((p) => p.id === second);
    return [
      { label: "Projects", href: "/projects/dashboard" },
      { label: project?.name ?? "Project" },
    ];
  }

  if (root === "quotes") {
    if (!second) {
      return [{ label: "Quotes" }];
    }
    const quote = db.quotes.find((q) => q.id === second);
    const project = quote
      ? db.projects.find((p) => p.id === quote.projectId)
      : undefined;
    const items: BreadcrumbItem[] = [
      { label: "Projects", href: "/projects/dashboard" },
    ];
    if (project) {
      items.push({ label: project.name, href: `/projects/${project.id}` });
    }
    items.push({ label: "Quotes", href: project ? `/projects/${project.id}` : "/quotes" });
    if (third === "edit") {
      items.push({ label: quote ? `Edit quote` : "Edit quote" });
    } else {
      items.push({
        label: quote?.jobName ?? quote?.number ?? "Quote",
      });
    }
    return items;
  }

  if (root === "contractors" && second) {
    return [
      { label: "Contractors", href: "/contractors" },
      { label: decodeURIComponent(second) },
    ];
  }

  if (root === "vendors" && second) {
    const vendor = db.vendors.find((v) => v.id === second);
    return [
      { label: "Vendors", href: "/vendors" },
      { label: vendor?.name ?? "Vendor" },
    ];
  }

  const label = STATIC_LABELS[root] ?? root.charAt(0).toUpperCase() + root.slice(1);
  return [{ label }];
}
