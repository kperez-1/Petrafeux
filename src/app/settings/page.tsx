"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { isRemote } from "@/lib/storage";
import {
  DEFAULT_HAUL_BROKER_FEE_PERCENT,
  DEFAULT_TAX_RATE,
  DEFAULT_HAUL_SELL_MARGIN_PERCENT,
} from "@/lib/db-defaults";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader, FormSection, FormField } from "@/components/layout";
import { setStoredCurrentUserId } from "@/lib/current-user";
import { fetchBundledHaulRates } from "@/lib/haul-rates-seed";
import {
  fetchServerDb,
  mergeAtpbMasterData,
  replaceContractorsFromServer,
} from "@/lib/db-hydrate";

export default function SettingsPage() {
  const { db, save } = useDb();
  const remote = isRemote();
  const [form, setForm] = useState({
    orgName: db.meta.orgName ?? "",
    orgCode: db.meta.orgCode ?? "",
    defaultTaxRate: String(db.meta.defaultTaxRate ?? DEFAULT_TAX_RATE),
    haulBrokerFeePercent: String(db.meta.haulBrokerFeePercent ?? DEFAULT_HAUL_BROKER_FEE_PERCENT),
    haulSellMarginPercent: String(db.meta.haulSellMarginPercent ?? DEFAULT_HAUL_SELL_MARGIN_PERCENT),
    currentUserId: db.meta.currentUserId ?? "",
  });
  const [saved, setSaved] = useState(false);
  const [haulLoading, setHaulLoading] = useState(false);
  const [haulMessage, setHaulMessage] = useState<string | null>(null);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorMessage, setVendorMessage] = useState<string | null>(null);
  const [contractorLoading, setContractorLoading] = useState(false);
  const [contractorMessage, setContractorMessage] = useState<string | null>(null);

  const quarryCount = db.vendors.filter((v) => v.type === "quarry").length;

  async function handleSave() {
    await save({
      ...db,
      meta: {
        ...db.meta,
        orgName: form.orgName.trim(),
        orgCode: form.orgCode.trim(),
        defaultTaxRate: parseFloat(form.defaultTaxRate) || DEFAULT_TAX_RATE,
        haulBrokerFeePercent:
          parseFloat(form.haulBrokerFeePercent) || DEFAULT_HAUL_BROKER_FEE_PERCENT,
        haulSellMarginPercent:
          parseFloat(form.haulSellMarginPercent) || DEFAULT_HAUL_SELL_MARGIN_PERCENT,
        currentUserId: form.currentUserId || undefined,
      },
    });
    setStoredCurrentUserId(form.currentUserId || undefined);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader
        icon={Settings}
        title="Settings"
        description="Organization defaults and pricing rules"
      />

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-700">Data storage</p>
        <p className="mt-1 text-sm text-gray-500">
          {remote ? (
            <>Live mode — data syncs via <code className="text-xs">/api/db</code> (D1 or local server file)</>
          ) : (
            <>Local mode — data is stored in this browser only</>
          )}
        </p>
      </div>

      <div className="space-y-8 rounded-xl border border-gray-200 bg-white p-6">
        <FormSection title="Team" description="Act as a user for filters and new project defaults">
          <FormField label="Current user">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={form.currentUserId}
              onChange={(e) => setForm({ ...form, currentUserId: e.target.value })}
            >
              <option value="">— Select user —</option>
              {db.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Used for &quot;My projects&quot; filter and default office on new projects. Run import:atpb to seed users.
            </p>
          </FormField>
        </FormSection>

        <FormSection title="Organization" description="Your company identity in Petrafi">
          <FormField label="Organization name">
            <Input
              className="h-10"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
            />
          </FormField>
          <FormField label="Organization code">
            <Input
              className="h-10"
              value={form.orgCode}
              onChange={(e) => setForm({ ...form, orgCode: e.target.value })}
            />
          </FormField>
        </FormSection>

        <FormSection
          title="Quarries (vendors)"
          description="55 ATPB loading sites from import — required for Vendors list and quote pickup"
        >
          <p className="text-sm text-gray-600">
            Quarries in this browser: <strong>{quarryCount}</strong>
            {quarryCount >= 55 ? " (complete)" : ""}
          </p>
          {!remote && (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={vendorLoading}
              onClick={async () => {
                setVendorLoading(true);
                setVendorMessage(null);
                try {
                  const server = await fetchServerDb();
                  const merged = mergeAtpbMasterData(db, server);
                  await save(merged);
                  const count = merged.vendors.filter((v) => v.type === "quarry").length;
                  setVendorMessage(`Loaded ${count} quarries into Vendors.`);
                } catch (e) {
                  setVendorMessage(String(e));
                } finally {
                  setVendorLoading(false);
                }
              }}
            >
              {vendorLoading ? "Loading…" : "Load ATPB quarries from import"}
            </Button>
          )}
          {vendorMessage && <p className="text-xs text-gray-500">{vendorMessage}</p>}
          <p className="text-xs text-gray-400">
            Run <code className="text-xs">npm run import:atpb</code> first so the server file has
            quarries. Refresh the page after loading.
          </p>
        </FormSection>

        <FormSection
          title="Contractors"
          description="Customers from petrafi atpb upload.xlsx — one contact per spreadsheet row"
        >
          <p className="text-sm text-gray-600">
            Contractors in this browser: <strong>{db.contractors.length}</strong>
          </p>
          {!remote && (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={contractorLoading}
              onClick={async () => {
                setContractorLoading(true);
                setContractorMessage(null);
                try {
                  const server = await fetchServerDb();
                  const merged = replaceContractorsFromServer(db, server);
                  await save(merged);
                  setContractorMessage(
                    `Loaded ${merged.contractors.length} contractors.`
                  );
                } catch (e) {
                  setContractorMessage(String(e));
                } finally {
                  setContractorLoading(false);
                }
              }}
            >
              {contractorLoading ? "Loading…" : "Load contractors from import"}
            </Button>
          )}
          {contractorMessage && <p className="text-xs text-gray-500">{contractorMessage}</p>}
          <p className="text-xs text-gray-400">
            Run <code className="text-xs">npm run import:contractors</code> first so the server
            file has contractors. Refresh the page after loading.
          </p>
        </FormSection>

        <FormSection
          title="Haul rates"
          description="Per-mile price per load (miles 1–150) used by Calc haul on quotes"
        >
          <p className="text-sm text-gray-600">
            Currently loaded: <strong>{db.haulRates.length}</strong> mile rate
            {db.haulRates.length !== 1 ? "s" : ""}
            {db.haulRates.length >= 150 ? " (complete table)" : ""}
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={haulLoading}
            onClick={async () => {
              setHaulLoading(true);
              setHaulMessage(null);
              try {
                const haulRates = await fetchBundledHaulRates();
                await save({ ...db, haulRates });
                setHaulMessage(`Loaded ${haulRates.length} haul rates.`);
              } catch (e) {
                setHaulMessage(String(e));
              } finally {
                setHaulLoading(false);
              }
            }}
          >
            {haulLoading ? "Loading…" : "Load ATPB haul rates"}
          </Button>
          {haulMessage && <p className="text-xs text-gray-500">{haulMessage}</p>}
          <p className="text-xs text-gray-400">
            Server/API: run <code className="text-xs">npm run import:haul</code> to update{" "}
            <code className="text-xs">.data/petrafi-db.json</code>
          </p>
        </FormSection>

        <FormSection title="Quote defaults" description="Defaults for new quotes and haul auto-calc">
          <FormField label="Default tax rate (%)">
            <Input
              type="number"
              className="h-10"
              step="0.1"
              min="0"
              value={form.defaultTaxRate}
              onChange={(e) => setForm({ ...form, defaultTaxRate: e.target.value })}
            />
            <p className="text-xs text-gray-400">Applied to taxable material sell only</p>
          </FormField>
          <FormField label="Haul broker fee (%)">
            <Input
              type="number"
              className="h-10"
              step="0.5"
              min="0"
              max="100"
              value={form.haulBrokerFeePercent}
              onChange={(e) => setForm({ ...form, haulBrokerFeePercent: e.target.value })}
            />
            <p className="text-xs text-gray-400">Platform income taken from haul buy rate</p>
          </FormField>
          <FormField label="Haul sell margin (%)">
            <Input
              type="number"
              className="h-10"
              step="1"
              min="0"
              value={form.haulSellMarginPercent}
              onChange={(e) => setForm({ ...form, haulSellMarginPercent: e.target.value })}
            />
            <p className="text-xs text-gray-400">Legacy zone lookup margin (quote edit uses 10% GP)</p>
          </FormField>
        </FormSection>

        <Button className="h-10 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white" onClick={handleSave}>
          {saved ? "Saved" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
