"use client";

import { useCallback, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { PageActionCard } from "@/components/layout";
import { EmailIntakeReviewSheet } from "./EmailIntakeReviewSheet";
import type { IntakeMatchPreview, ParsedEmailIntake } from "@/lib/email-intake/types";

export function EmailIntakeCard() {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedEmailIntake | null>(null);
  const [matches, setMatches] = useState<IntakeMatchPreview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".msg")) {
      setError("Please drop an Outlook .msg file.");
      return;
    }
    setError(null);
    setProcessing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/email-intake/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      setSessionId(data.sessionId);
      setParsed(data.parsed);
      setMatches(data.matches);
      setReviewOpen(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setProcessing(false);
    }
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  return (
    <>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="contents"
      >
        <PageActionCard
          icon={Mail}
          title="Email intake"
          description={
            processing
              ? "Processing message…"
              : "Drop an Outlook .msg file to create a project from bid email."
          }
          buttonLabel={processing ? "Processing…" : "Choose .msg file"}
          onClick={() => inputRef.current?.click()}
          disabled={processing}
        />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".msg,application/vnd.ms-outlook"
        className="hidden"
        onChange={onFileChange}
      />
      {error && (
        <p className="col-span-full text-sm text-red-600 -mt-2">{error}</p>
      )}
      {parsed && matches && sessionId && (
        <EmailIntakeReviewSheet
          open={reviewOpen}
          onOpenChange={(open) => {
            setReviewOpen(open);
            if (!open) {
              setSessionId(null);
              setParsed(null);
              setMatches(null);
            }
          }}
          sessionId={sessionId}
          parsed={parsed}
          matches={matches}
        />
      )}
    </>
  );
}
