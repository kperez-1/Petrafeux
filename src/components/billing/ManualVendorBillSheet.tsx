"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { createManualVendorBill } from "@/lib/billing-manual-vendor";

export function ManualVendorBillSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const { db, save } = useDb();
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setVendorId("");
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setAmount("");
    setDescription("");
    setOrderId("");
    setError("");
  }, [open]);

  async function submit() {
    setError("");
    try {
      const { db: next, settlement } = createManualVendorBill(db, {
        vendorId,
        vendorInvoiceNumber: invoiceNumber,
        vendorInvoiceDate: invoiceDate,
        dueDate: dueDate || undefined,
        amount: parseFloat(amount),
        description,
        orderId: orderId || undefined,
      });
      await save(next);
      onOpenChange(false);
      onCreated?.(settlement.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create payable");
    }
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Enter vendor invoice"
      description="Record a vendor bill that did not come from ticket approval."
      submitLabel="Create payable"
      onSubmit={submit}
      disabled={!vendorId || !invoiceNumber.trim() || !amount || parseFloat(amount) <= 0}
    >
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <FormSection title="Vendor bill" description="Monthly statement or bill not tied to a delivery ticket">
        <FormField label="Vendor" required>
          <select
            className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">Select vendor…</option>
            {db.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Vendor invoice #" required>
          <Input
            className="h-10"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </FormField>
        <FormField label="Invoice date" required>
          <Input
            type="date"
            className="h-10"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </FormField>
        <FormField label="Due date">
          <Input
            type="date"
            className="h-10"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </FormField>
        <FormField label="Amount" required>
          <Input
            type="number"
            step="0.01"
            min="0"
            className="h-10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>
        <FormField label="Description">
          <Input
            className="h-10"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField label="Link to order (optional)">
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
      </FormSection>
    </CreateFormSheet>
  );
}
