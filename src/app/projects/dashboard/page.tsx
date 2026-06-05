"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, Search, Plus, List, Archive } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import {
  PageHeader,
  PageActionCards,
  PageActionCard,
  PageToolbar,
} from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProjectFormSheet } from "@/components/projects/ProjectFormSheet";
import { EmailIntakeCard } from "@/components/projects/EmailIntakeCard";
import { PROJECT_STAGES, Project, ProjectStage } from "@/lib/types";
import { setProjectStage } from "@/lib/projects";
import { resolveCurrentUser } from "@/lib/current-user";

const ACTIVE_STAGES: ProjectStage[] = [
  "new",
  "proposal_requested",
  "proposal_presented",
  "in_negotiation",
  "closed_won",
];

const ARCHIVED_STAGE: ProjectStage = "closed_lost";

function officeLabel(db: ReturnType<typeof useDb>["db"], officeId?: string) {
  if (!officeId) return null;
  const o = db.offices.find((x) => x.id === officeId);
  return o?.code ?? null;
}

function ProjectCard({
  project,
  db,
  onDragStart,
}: {
  project: Project;
  db: ReturnType<typeof useDb>["db"];
  onDragStart: (e: React.DragEvent, id: string) => void;
}) {
  const router = useRouter();
  const didDrag = useRef(false);
  const quoteCount = db.quotes.filter((q) => q.projectId === project.id).length;
  const office = officeLabel(db, project.officeId);
  const sp = db.users.find((u) => u.id === project.salespersonId);

  function handleClick() {
    if (didDrag.current) return;
    router.push(`/projects/${project.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!didDrag.current) router.push(`/projects/${project.id}`);
    }
  }

  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(e) => {
        didDrag.current = true;
        onDragStart(e, project.id);
      }}
      onDragEnd={() => {
        requestAnimationFrame(() => {
          didDrag.current = false;
        });
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm active:cursor-grabbing hover:border-[#0f6b4f]/40 focus:outline-none focus:ring-2 focus:ring-[#0f6b4f]/30"
    >
      <span className="font-medium text-sm text-gray-900">{project.name}</span>
      {project.address && (
        <p className="mt-1 text-xs text-gray-500 line-clamp-2">{project.address}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {office && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
            {office}
          </span>
        )}
        {sp && (
          <span className="rounded bg-[#0f6b4f]/10 px-1.5 py-0.5 text-[10px] text-[#0f6b4f]">
            {sp.name}
          </span>
        )}
        <span className="text-[10px] text-gray-400">{quoteCount} quote{quoteCount !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

export default function ProjectsDashboardPage() {
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [myProjectsOnly, setMyProjectsOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const currentUser = resolveCurrentUser(db);

  const filtered = useMemo(() => {
    return db.projects.filter((p) => {
      if (!showArchived && p.archived) return false;
      if (showArchived && !p.archived && p.stage !== ARCHIVED_STAGE) {
        /* show all when archived toggle for closed lost column */
      }
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (officeFilter && p.officeId !== officeFilter) return false;
      if (salesFilter && p.salespersonId !== salesFilter) return false;
      if (
        myProjectsOnly &&
        currentUser?.role === "salesperson" &&
        p.salespersonId !== currentUser.id
      ) {
        return false;
      }
      return true;
    });
  }, [db.projects, search, officeFilter, salesFilter, showArchived, myProjectsOnly, currentUser]);

  const columns = showArchived
    ? [...ACTIVE_STAGES, ARCHIVED_STAGE]
    : ACTIVE_STAGES;

  async function moveProject(projectId: string, stage: ProjectStage) {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) return;
    const updated = setProjectStage(project, stage);
    await save({
      ...db,
      projects: db.projects.map((p) => (p.id === projectId ? updated : p)),
    });
  }

  function onDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.setData("text/plain", id);
  }

  function onDrop(e: React.DragEvent, stage: ProjectStage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    if (id) moveProject(id, stage);
    setDragId(null);
  }

  return (
    <div className="p-8 flex flex-col h-full min-h-0">
      <PageHeader
        icon={FolderOpen}
        title="Projects"
        description="CRM pipeline — drag cards to update stage"
      >
        <Link href="/projects/list">
          <Button variant="outline" size="sm" className="gap-1">
            <List className="h-4 w-4" />
            All projects
          </Button>
        </Link>
      </PageHeader>

      <PageActionCards>
        <PageActionCard
          icon={Plus}
          title="New Project"
          description="Add a job to the pipeline."
          buttonLabel="New Project"
          onClick={() => setOpen(true)}
        />
        <EmailIntakeCard />
      </PageActionCards>

      <PageToolbar>
        <div className="relative min-w-[180px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="h-10 pl-9"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
          value={officeFilter}
          onChange={(e) => setOfficeFilter(e.target.value)}
        >
          <option value="">All offices</option>
          {db.offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
          value={salesFilter}
          onChange={(e) => setSalesFilter(e.target.value)}
        >
          <option value="">All salespeople</option>
          {db.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {currentUser?.role === "salesperson" && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={myProjectsOnly}
              onChange={(e) => setMyProjectsOnly(e.target.checked)}
            />
            My projects
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <Archive className="h-4 w-4" />
          Show archived
        </label>
      </PageToolbar>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max h-full">
          {columns.map((stage) => {
            const label = PROJECT_STAGES.find((s) => s.value === stage)?.label ?? stage;
            const cards = filtered.filter((p) => (p.stage ?? "new") === stage);
            return (
              <div
                key={stage}
                className="flex w-[240px] shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-50/80"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, stage)}
              >
                <div className="border-b border-gray-200 px-3 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    {label}
                  </h3>
                  <span className="text-[10px] text-gray-400">{cards.length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2 min-h-[120px]">
                  {cards.map((p) => (
                    <ProjectCard key={p.id} project={p} db={db} onDragStart={onDragStart} />
                  ))}
                  {cards.length === 0 && (
                    <p className="py-4 text-center text-xs text-gray-400">Drop here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ProjectFormSheet open={open} onOpenChange={setOpen} onCreated={() => {}} />
    </div>
  );
}
