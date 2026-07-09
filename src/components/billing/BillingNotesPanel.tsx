"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingNote } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function BillingNotesPanel({
  title = "Notes",
  notes = [],
  onAddNote,
}: {
  title?: string;
  notes?: BillingNote[];
  onAddNote: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!body.trim() || saving) return;
    setSaving(true);
    try {
      await onAddNote(body);
      setBody("");
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
        <MessageSquare className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {notes.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{notes.length}</span>
        )}
      </div>
      <div className="p-4 space-y-3">
        <textarea
          className="min-h-[72px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note…"
        />
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={!body.trim() || saving}
          onClick={submit}
        >
          Add note
        </Button>
        {sorted.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-2">No notes yet</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {sorted.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 text-sm"
              >
                <p className="text-gray-900 whitespace-pre-wrap">{note.body}</p>
                <p className="mt-1 text-[10px] text-gray-400">
                  {formatDate(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
