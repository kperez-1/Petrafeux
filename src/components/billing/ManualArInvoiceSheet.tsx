"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { createManualArInvoice } from "@/lib/billing-manual-ar";
import { ProjectPickerField } from "@/components/projects/ProjectPickerField";

export function ManualArInvoiceSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const { db, save } = useDb();
  const [projectId, setProjectId] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [sellRate, setSellRate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setProjectId("");
    setContractorId("");
    setOrderId("");
    setDueDate("");
    setAttachmentUrl("");
    setDescription("");
    setQty("1");
    setSellRate("");
    setError("");
  }, [open]);

  async function submit() {
    setError("");
    const rate = parseFloat(sellRate);
    const quantity = parseFloat(qty);
    if (!projectId || !description.trim() || !rate || rate <= 0) return;
    try {
      const { db: next, invoice } = createManualArInvoice(db, {
        projectId,
        contractorId: contractorId || undefined,
        orderId: orderId || undefined,
        dueDate: dueDate || undefined,
        attachmentUrl: attachmentUrl || undefined,
        lines: [{ description, qty: quantity || 1, sellRate: rate }],
      });
      await save(next);
      onOpenChange(false);
      onCreated?.(invoice.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invoice");
    }
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Manual customer invoice"
      description="Create an AR invoice for charges not tied to ticket approval."
      submitLabel="Create invoice"
      onSubmit={submit}
      disabled={!projectId || !description.trim() || !sellRate || parseFloat(sellRate) <= 0}
    >
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <FormSection title="Invoice" description="Non-ticket charge (mobilization, standby, etc.)">
        <FormField label="Project" required>
          <ProjectPickerField value={projectId} onChange={setProjectId} />
        </FormField>
        <FormField label="Contractor contact">
          <select
            className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={contractorId}
            onChange={(e) => setContractorId(e.target.value)}
          >
            <option value="">None</option>
            {db.contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company} — {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Order (optional)">
          <select
            className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          >
            <option value="">None</option>
            {db.orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.number} — {o.jobName}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Due date">
          <Input type="date" className="h-10" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FormField>
        <FormField label="PDF attachment URL (stub)">
          <Input
            className="h-10"
            value={attachmentUrl}
            onChange={(e) => setAttachmentUrl(e.target.value)}
            placeholder="https://…"
          />
        </FormField>
        <FormField label="Line description" required>
          <Input className="h-10" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Qty">
            <Input type="number" step="0.01" className="h-10" value={qty} onChange={(e) => setQty(e.target.value)} />
          </FormField>
          <FormField label="Sell rate" required>
            <Input
              type="number"
              step="0.01"
              className="h-10"
              value={sellRate}
              onChange={(e) => setSellRate(e.target.value)}
            />
          </FormField>
        </div>
      </FormSection>
    </CreateFormSheet>
  );
}
