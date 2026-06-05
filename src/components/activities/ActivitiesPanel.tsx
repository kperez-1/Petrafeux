"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Calendar, CheckCircle2 } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { Button } from "@/components/ui/button";
import { Activity } from "@/lib/types";
import {
  ACTIVITY_TYPE_LABELS,
  activityRelationLabel,
  formatActivityWhen,
} from "@/lib/activities";
import { ActivityFormSheet, ActivityFormDefaults } from "./ActivityFormSheet";

export function ActivitiesPanel({
  title = "Activities",
  activities,
  createDefaults,
}: {
  title?: string;
  activities: Activity[];
  createDefaults?: ActivityFormDefaults;
}) {
  const { db, save } = useDb();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDefaults, setSheetDefaults] = useState<ActivityFormDefaults | undefined>();

  function openSheet(preset?: ActivityFormDefaults) {
    setSheetDefaults({ ...createDefaults, ...preset });
    setSheetOpen(true);
  }

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
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => openSheet({ status: "scheduled" })}
          >
            <Calendar className="h-3.5 w-3.5" /> Schedule
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => openSheet({ status: "completed" })}
          >
            <Plus className="h-3.5 w-3.5" /> Log
          </Button>
        </div>
      </div>
      {activities.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">No activities yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {activities.map((a) => (
            <li key={a.id} className="px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{a.subject}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        a.status === "scheduled"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {a.status === "scheduled" ? "Scheduled" : "Completed"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {ACTIVITY_TYPE_LABELS[a.type]} · {formatActivityWhen(a)}
                  </p>
                  <p className="text-xs text-gray-400">{activityRelationLabel(db, a)}</p>
                </div>
                {a.status === "scheduled" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1 text-xs text-[#0f6b4f]"
                    onClick={() => markComplete(a)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Done
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-gray-100 px-4 py-2 text-center">
        <Link href="/activities" className="text-xs text-[#0f6b4f] hover:underline">
          View all activities
        </Link>
      </div>
      <ActivityFormSheet open={sheetOpen} onOpenChange={setSheetOpen} defaults={sheetDefaults} />
    </div>
  );
}
