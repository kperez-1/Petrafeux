"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { PaymentDocumentKind, PaymentMethod } from "@/lib/types";
import { recordPayment } from "@/lib/billing-payments";

export function RecordPaymentSheet({
  open,
  onOpenChange,
  documentKind,
  documentId,
  defaultAmount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentKind: PaymentDocumentKind;
  documentId: string;
  defaultAmount: number;
}) {
  const { db, save } = useDb();
  const [method, setMethod] = useState<PaymentMethod>("check");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (!open) return;
    setMethod("check");
    setAmount(String(defaultAmount));
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setPaidAt(now.toISOString().slice(0, 16));
    setReference("");
  }, [open, defaultAmount]);

  async function submit() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || !paidAt) return;
    await save(
      recordPayment(db, documentKind, documentId, {
        method,
        amount: parsed,
        paidAt: new Date(paidAt).toISOString(),
        reference,
        recordedByUserId: db.meta.currentUserId,
      })
    );
    onOpenChange(false);
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      description="Record a check or ACH payment against this document."
      submitLabel="Record payment"
      onSubmit={submit}
      disabled={!amount || parseFloat(amount) <= 0 || !paidAt}
    >
      <FormSection title="Payment" description="Check or ACH details">
        <FormField label="Method" required>
          <select
            className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            <option value="check">Check</option>
            <option value="ach">ACH</option>
          </select>
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
        <FormField label="Paid on" required>
          <Input
            type="datetime-local"
            className="h-10"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </FormField>
        <FormField label="Reference">
          <Input
            className="h-10"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Check # or ACH trace"
          />
        </FormField>
      </FormSection>
    </CreateFormSheet>
  );
}
