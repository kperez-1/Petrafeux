"use client";

import { useMemo, useState } from "react";
import { Calendar, Search, CheckCircle2 } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import {
  PageHeader,
  PageActionCards,
  PageActionCard,
  PageToolbar,
} from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ACTIVITY_TYPE_LABELS,
  activityRelationLabel,
  formatActivityWhen,
  sortActivities,
} from "@/lib/activities";
import { ActivityFormSheet } from "@/components/activities/ActivityFormSheet";
import { Activity, ActivityStatus } from "@/lib/types";
export default function ActivitiesPage() {
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ActivityStatus | "all">("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPreset, setSheetPreset] = useState<ActivityStatus>("scheduled");

  const filtered = useMemo(() => {
    let list = sortActivities(db.activities);
    if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.subject.toLowerCase().includes(q) ||
          activityRelationLabel(db, a).toLowerCase().includes(q)
      );
    }
    return list;
  }, [db, search, statusFilter]);

  async function markComplete(activity: Activity) {
    const now = new Date().toISOString();
    await save({
      ...db,
      activities: db.activities.map((a) =>
        a.id === activity.id
          ? { ...a, status: "completed", completedAt: now, updatedAt: now }
          : a
      ),
    });
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={Calendar}
        title="Activities"
        description="Schedule and log calls, meetings, and jobsite visits"
      />

      <PageActionCards>
        <PageActionCard
          icon={Calendar}
          title="Schedule activity"
          description="Plan a future call, meeting, or jobsite visit."
          buttonLabel="Schedule activity"
          onClick={() => {
            setSheetPreset("scheduled");
            setSheetOpen(true);
          }}
        />
        <PageActionCard
          icon={CheckCircle2}
          title="Log completed activity"
          description="Record something that already happened."
          buttonLabel="Log activity"
          variant="outline"
          onClick={() => {
            setSheetPreset("completed");
            setSheetOpen(true);
          }}
        />
      </PageActionCards>

      <PageToolbar
        trailing={
          <select
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ActivityStatus | "all")}
          >
            <option value="all">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
          </select>
        }
      >
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="h-10 pl-9"
            placeholder="Search activities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </PageToolbar>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Subject</th>
              <th className="px-4 py-3 text-left font-medium">Related to</th>
              <th className="px-4 py-3 text-left font-medium">When</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No activities yet — schedule or log one above.
                </td>
              </tr>
            )}
            {filtered.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{ACTIVITY_TYPE_LABELS[a.type]}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{a.subject}</td>
                <td className="px-4 py-3 text-gray-500">{activityRelationLabel(db, a)}</td>
                <td className="px-4 py-3 text-gray-500">{formatActivityWhen(a)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.status === "scheduled"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    {a.status === "scheduled" ? "Scheduled" : "Completed"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {a.status === "scheduled" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-[#0f6b4f]"
                      onClick={() => markComplete(a)}
                    >
                      Mark complete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ActivityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaults={{ status: sheetPreset }}
      />
    </div>
  );
}
