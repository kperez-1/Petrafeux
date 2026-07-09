"use client";

import { useEffect, useMemo, useState } from "react";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getContactsForCompany } from "@/lib/contractors";
import { sendQuoteWithRecipients } from "@/lib/quote-actions";
import { quoteProposalPdfBase64 } from "@/lib/quote-pdf";
import { generateId } from "@/lib/utils";
import type { Contractor, Quote, QuoteSendRecipient } from "@/lib/types";

type RecipientRow = QuoteSendRecipient & {
  id: string;
  selected: boolean;
  noEmail?: boolean;
  /** When true, save as new Contractor on send */
  persistContact?: boolean;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function QuoteSendSheet({
  quote,
  open,
  onOpenChange,
}: {
  quote: Quote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { db, save } = useDb();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<RecipientRow[]>([]);

  const [addFirst, setAddFirst] = useState("");
  const [addLast, setAddLast] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addEmailOnly, setAddEmailOnly] = useState("");
  const [addEmailOnlyName, setAddEmailOnlyName] = useState("");

  const assigned = quote.contractorId
    ? db.contractors.find((c) => c.id === quote.contractorId)
    : undefined;
  const companyName = assigned?.company?.trim() ?? "";

  const companyContacts = useMemo(() => {
    if (!companyName) return [];
    return getContactsForCompany(db, companyName);
  }, [db, companyName]);

  useEffect(() => {
    if (!open) return;
    setMessage(
      `Please find attached our proposal for ${quote.jobName}.`
    );
    setError(null);
    setAddFirst("");
    setAddLast("");
    setAddEmail("");
    setAddEmailOnly("");
    setAddEmailOnlyName("");

    const initial: RecipientRow[] = companyContacts.map((c) => ({
      id: c.id,
      contactId: c.id,
      email: c.email.trim().toLowerCase(),
      name: `${c.firstName} ${c.lastName}`.trim(),
      selected: c.id === quote.contractorId && !!c.email.trim(),
      noEmail: !c.email.trim(),
    }));
    setRows(initial);
  }, [open, companyContacts, quote.contractorId, quote.jobName]);

  function toggleRow(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id && !r.noEmail ? { ...r, selected: !r.selected } : r))
    );
  }

  function addContactRecipient() {
    const email = addEmail.trim().toLowerCase();
    if (!isValidEmail(email)) return;
    const name = `${addFirst.trim()} ${addLast.trim()}`.trim();
    if (rows.some((r) => r.email === email)) return;
    setRows((prev) => [
      ...prev,
      {
        id: generateId(),
        email,
        name: name || undefined,
        selected: true,
        persistContact: true,
      },
    ]);
    setAddFirst("");
    setAddLast("");
    setAddEmail("");
  }

  function addAdHocRecipient() {
    const email = addEmailOnly.trim().toLowerCase();
    if (!isValidEmail(email)) return;
    if (rows.some((r) => r.email === email)) return;
    setRows((prev) => [
      ...prev,
      {
        id: generateId(),
        email,
        name: addEmailOnlyName.trim() || undefined,
        selected: true,
      },
    ]);
    setAddEmailOnly("");
    setAddEmailOnlyName("");
  }

  const selectedRecipients = rows.filter((r) => r.selected && r.email && !r.noEmail);

  async function submit() {
    if (selectedRecipients.length === 0) return;
    setSending(true);
    setError(null);

    let workingDb = db;
    const newContacts: Contractor[] = [];

    for (const r of selectedRecipients) {
      if (r.contactId || !r.persistContact) continue;
      const existing = db.contractors.find(
        (c) => c.email.trim().toLowerCase() === r.email
      );
      if (existing) {
        r.contactId = existing.id;
        continue;
      }
      const nameParts = (r.name ?? "").split(/\s+/);
      const c: Contractor = {
        id: generateId(),
        firstName: nameParts[0] ?? "",
        lastName: nameParts.slice(1).join(" "),
        company: companyName || "Unassigned",
        email: r.email,
        phone: "",
        address: "",
      };
      newContacts.push(c);
      r.contactId = c.id;
    }

    if (newContacts.length) {
      workingDb = { ...workingDb, contractors: [...newContacts, ...workingDb.contractors] };
    }

    const recipients: QuoteSendRecipient[] = selectedRecipients.map((r) => ({
      email: r.email,
      name: r.name,
      contactId: r.contactId,
    }));

    try {
      const pdfBase64 = quoteProposalPdfBase64(quote, workingDb);
      const res = await fetch("/api/quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.id,
          recipients,
          message,
          pdfBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");

      const nextDb = sendQuoteWithRecipients(workingDb, quote.id, recipients, message);
      if (nextDb) await save(nextDb);
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Send proposal"
      description={`${quote.number} · ${quote.jobName}`}
      submitLabel={sending ? "Sending…" : "Send proposal"}
      onSubmit={submit}
      disabled={sending || selectedRecipients.length === 0}
    >
      {!companyName && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Assign a contractor on the quote before sending, or add recipients below with a valid
          email.
        </div>
      )}

      {companyName && (
        <FormSection title="Recipients" description={`Contacts at ${companyName}`}>
          {rows.length === 0 && (
            <p className="text-sm text-gray-500">No contacts for this company yet.</p>
          )}
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <label
                  className={`flex items-center gap-2 text-sm ${r.noEmail ? "text-gray-400" : "text-gray-700"}`}
                >
                  <input
                    type="checkbox"
                    checked={r.selected}
                    disabled={r.noEmail}
                    onChange={() => toggleRow(r.id)}
                  />
                  <span>
                    {r.name || r.email}
                    {r.name && r.email ? ` · ${r.email}` : ""}
                    {r.noEmail ? " (no email)" : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </FormSection>
      )}

      <FormSection title="Add contact" description="Save a new contact at send time.">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name">
            <Input value={addFirst} onChange={(e) => setAddFirst(e.target.value)} />
          </FormField>
          <FormField label="Last name">
            <Input value={addLast} onChange={(e) => setAddLast(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Email">
          <Input
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
          />
        </FormField>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!isValidEmail(addEmail)}
          onClick={addContactRecipient}
        >
          Add contact to list
        </Button>
      </FormSection>

      <FormSection title="Add email only" description="Ad-hoc recipient (not saved as contact).">
        <FormField label="Display name (optional)">
          <Input
            value={addEmailOnlyName}
            onChange={(e) => setAddEmailOnlyName(e.target.value)}
          />
        </FormField>
        <FormField label="Email">
          <Input
            type="email"
            value={addEmailOnly}
            onChange={(e) => setAddEmailOnly(e.target.value)}
          />
        </FormField>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!isValidEmail(addEmailOnly)}
          onClick={addAdHocRecipient}
        >
          Add email to list
        </Button>
      </FormSection>

      <FormField label="Message">
        <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
      </FormField>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </CreateFormSheet>
  );
}
