"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VendorSettlement, VendorSettlementDispute } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import {
  canDisputeVendorSettlement,
  disputeVendorSettlement,
  resolveVendorDispute,
} from "@/lib/billing-disputes";

export function VendorDisputeCard({
  settlement,
}: {
  settlement: VendorSettlement;
}) {
  const { db, save } = useDb();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (settlement.status === "disputed" && settlement.dispute) {
    return (
      <VendorDisputeSummary
        dispute={settlement.dispute}
        onResolve={async () => {
          await save(resolveVendorDispute(db, settlement.id));
        }}
      />
    );
  }

  if (!canDisputeVendorSettlement(settlement)) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-red-200 text-red-700 hover:bg-red-50"
        onClick={() => setSheetOpen(true)}
      >
        <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
        Dispute
      </Button>
      <VendorDisputeSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        settlementId={settlement.id}
      />
    </>
  );
}

function VendorDisputeSummary({
  dispute,
  onResolve,
}: {
  dispute: VendorSettlementDispute;
  onResolve: () => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-red-800">Disputed</p>
          <p className="mt-2 text-gray-700 whitespace-pre-wrap">{dispute.reason}</p>
          {(dispute.correctRate != null || dispute.correctAmount != null) && (
            <dl className="mt-3 space-y-1 text-gray-600">
              {dispute.correctRate != null && (
                <div className="flex justify-between gap-4">
                  <dt>Correct rate</dt>
                  <dd className="font-medium text-gray-900">
                    {formatCurrency(dispute.correctRate)}/unit
                  </dd>
                </div>
              )}
              {dispute.correctAmount != null && (
                <div className="flex justify-between gap-4">
                  <dt>Correct amount</dt>
                  <dd className="font-medium text-gray-900">
                    {formatCurrency(dispute.correctAmount)}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onResolve}>
          Resolve
        </Button>
      </div>
    </div>
  );
}

export function VendorDisputeSheet({
  open,
  onOpenChange,
  settlementId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settlementId: string;
}) {
  const { db, save } = useDb();
  const [reason, setReason] = useState("");
  const [correctRate, setCorrectRate] = useState("");
  const [correctAmount, setCorrectAmount] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setCorrectRate("");
    setCorrectAmount("");
  }, [open]);

  async function submit() {
    if (!reason.trim()) return;
    await save(
      disputeVendorSettlement(db, settlementId, {
        reason,
        correctRate: correctRate ? Number(correctRate) : undefined,
        correctAmount: correctAmount ? Number(correctAmount) : undefined,
      })
    );
    onOpenChange(false);
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Dispute vendor payable"
      description="Document what was incorrect and what the rate or amount should be."
      submitLabel="Submit dispute"
      onSubmit={submit}
      disabled={!reason.trim()}
    >
      <FormSection title="Dispute details" description="Required for vendor billing corrections">
        <FormField label="What was incorrect" required>
          <textarea
            className="min-h-[100px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the billing error…"
          />
        </FormField>
        <FormField label="Correct rate ($/unit)">
          <Input
            type="number"
            step="0.01"
            min="0"
            className="h-10"
            value={correctRate}
            onChange={(e) => setCorrectRate(e.target.value)}
            placeholder="Optional"
          />
        </FormField>
        <FormField label="Correct total amount">
          <Input
            type="number"
            step="0.01"
            min="0"
            className="h-10"
            value={correctAmount}
            onChange={(e) => setCorrectAmount(e.target.value)}
            placeholder="Optional"
          />
        </FormField>
      </FormSection>
    </CreateFormSheet>
  );
}
