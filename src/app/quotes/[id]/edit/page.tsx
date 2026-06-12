"use client";

import { use, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, MapPin } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { QuoteRoute, Vendor, RouteMaterialLine } from "@/lib/types";
import { sortPickupVendorsByProximity } from "@/lib/vendors";
import { generateId, formatCurrency, roundCents, ceilCents } from "@/lib/utils";
import { getBrokerFeePercent } from "@/lib/db-defaults";
import {
  calcQuote,
  DEFAULT_HAUL_GP_PERCENT,
  DEFAULT_MATERIAL_GP_PERCENT,
  haulSellFromBuyGp,
  materialSellFromBuyGp,
} from "@/lib/quote-calc";
import { haulBuyRateForUnit } from "@/lib/haul-pricing";
import {
  normalizeRouteMaterials,
  syncRouteLegacyMaterial,
  getRouteMaterials,
  applyCatalogMaterialToLine,
  emptyMaterialLine,
  upsertCatalogMaterial,
} from "@/lib/route-materials";
import { VendorMap } from "@/components/VendorMap";
import { applyMapClipboardToRoutes, type MapClipboardItem } from "@/lib/map-clipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateFormSheet, FormSection, FormField } from "@/components/layout";
import { RouteRow } from "./RouteRow";

function emptyRoute(quoteId: string, sortOrder: number): QuoteRoute {
  return {
    id: generateId(),
    quoteId,
    sortOrder,
    pickupAddress: "",
    dropoffAddress: "",
    haulRate: 0,
    haulCost: 0,
    haulQty: 1,
    haulUnit: "TN",
    materialId: undefined,
    materialName: "",
    materialType: "",
    materialRate: 0,
    materialCost: 0,
    materialQty: 1,
    materialUnit: "TN",
    materialLines: [],
    taxable: true,
  };
}

export default function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, save } = useDb();

  const quote = db.quotes.find((q) => q.id === id);
  const project = quote ? db.projects.find((p) => p.id === quote.projectId) : null;

  const [routes, setRoutes] = useState<QuoteRoute[]>(() =>
    (quote?.routes ?? []).map(normalizeRouteMaterials)
  );
  const [taxRate, setTaxRate] = useState(quote?.taxRate ?? db.meta.defaultTaxRate ?? 7);
  const [contractorId, setContractorId] = useState(quote?.contractorId ?? "");
  const [showMap, setShowMap] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [vendorRouteIndex, setVendorRouteIndex] = useState<number | null>(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [materialRouteIndex, setMaterialRouteIndex] = useState<number | null>(null);
  const [materialLineId, setMaterialLineId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newVendorForm, setNewVendorForm] = useState<{
    name: string;
    address: string;
    type: "quarry" | "disposal";
  }>({ name: "", address: "", type: "quarry" });
  const [newMaterialForm, setNewMaterialForm] = useState<{
    name: string;
    buy: string;
    unit: "TN" | "CY" | "LD" | "HR";
  }>({ name: "", buy: "", unit: "TN" });
  const [pickupVendors, setPickupVendors] = useState<Vendor[]>([]);

  useEffect(() => {
    let cancelled = false;
    sortPickupVendorsByProximity(db.vendors, project?.address).then((sorted) => {
      if (!cancelled) setPickupVendors(sorted);
    });
    return () => {
      cancelled = true;
    };
  }, [db.vendors, project?.address]);

  if (!quote) {
    return (
      <div className="p-8 text-gray-400">
        Quote not found.{" "}
        <Link href="/quotes" className="text-[#0f6b4f] underline">Back to quotes</Link>
      </div>
    );
  }

  const brokerFeePercent = getBrokerFeePercent(db.meta);
  const calc = calcQuote({ ...quote, routes, taxRate, contractorId: contractorId || undefined }, db.meta);

  function updateRoute(index: number, patch: Partial<QuoteRoute>) {
    setRoutes((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRoute() {
    setRoutes((prev) => [
      ...prev,
      { ...emptyRoute(quote!.id, prev.length), dropoffAddress: project?.address ?? "" },
    ]);
  }

  function removeRoute(index: number) {
    setRoutes((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRouteMaterials(index: number, lines: RouteMaterialLine[]) {
    setRoutes((prev) =>
      prev.map((r, i) =>
        i === index ? syncRouteLegacyMaterial({ ...r, materialLines: lines }) : r
      )
    );
  }

  const handleMapApply = useCallback(
    (items: MapClipboardItem[], job: { address: string; name: string }) => {
      if (items.length === 0) return;
      const dropoff = job.address.trim() || project?.address || "";
      const { db: workingDb, routes: nextRoutes } = applyMapClipboardToRoutes(
        db,
        items,
        dropoff,
        quote.id,
        routes
      );
      setRoutes(nextRoutes.map(normalizeRouteMaterials));

      if (workingDb !== db || (project && dropoff && dropoff !== project.address)) {
        void save({
          ...workingDb,
          projects: workingDb.projects.map((p) =>
            p.id === project?.id
              ? {
                  ...p,
                  address: dropoff || p.address,
                  name: job.name.trim() || p.name,
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
          quotes: workingDb.quotes.map((q) =>
            q.id === quote.id
              ? {
                  ...q,
                  projectName: job.name.trim() || q.projectName,
                  jobName: job.name.trim() || q.jobName,
                }
              : q
          ),
        });
      }
      setShowMap(false);
    },
    [db, save, quote.id, project, routes]
  );

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        ...db,
        quotes: db.quotes.map((q) => {
          if (q.id !== id) return q;
          const contractor = db.contractors.find((c) => c.id === contractorId);
          return {
            ...q,
            routes: routes.map((r) => syncRouteLegacyMaterial(normalizeRouteMaterials(r))),
            taxRate,
            contractorId: contractorId || undefined,
            contractorName: contractor
              ? `${contractor.firstName} ${contractor.lastName}`.trim()
              : undefined,
          };
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function createVendorForRoute() {
    if (!newVendorForm.name.trim()) return;
    const vendorId = generateId();
    const newVendor: Vendor = {
      id: vendorId,
      name: newVendorForm.name.trim(),
      address: newVendorForm.address.trim(),
      type: newVendorForm.type,
    };
    await save({ ...db, vendors: [...db.vendors, newVendor] });
    setPickupVendors((prev) => [...prev, newVendor]);

    if (vendorRouteIndex !== null) {
      updateRoute(vendorRouteIndex, {
        pickupVendorId: vendorId,
        pickupAddress: newVendor.address,
      });
    }

    setNewVendorForm({ name: "", address: "", type: "quarry" });
    setVendorRouteIndex(null);
    setShowAddVendor(false);
  }

  async function createMaterialForRoute() {
    if (!newMaterialForm.name.trim() || materialRouteIndex === null) return;
    const route = routes[materialRouteIndex];
    const buy = parseFloat(newMaterialForm.buy) || 0;
    const { db: nextDb, material } = upsertCatalogMaterial(db, {
      name: newMaterialForm.name.trim(),
      pricePerTon: buy,
      priceUnit: newMaterialForm.unit,
      vendorId: route.pickupVendorId,
    });
    await save(nextDb);

    const linePatch = applyCatalogMaterialToLine(material);
    const lines = getRouteMaterials(route).map((l) =>
      l.id === materialLineId ? { ...l, ...linePatch } : l
    );
    if (!materialLineId || !lines.some((l) => l.id === materialLineId)) {
      lines.push({ ...emptyMaterialLine(), ...linePatch });
    }
    updateRouteMaterials(materialRouteIndex, lines);

    setNewMaterialForm({ name: "", buy: "", unit: "TN" });
    setMaterialRouteIndex(null);
    setMaterialLineId(null);
    setShowAddMaterial(false);
  }

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
          <Link href={`/quotes/${id}`} className="text-gray-400 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">
              Edit Quote — {quote.jobName}
            </h1>
            <p className="text-xs text-gray-400">{quote.number}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowMap(true)}
          >
            <MapPin className="h-4 w-4" />
            Open Map
          </Button>
          <Button
            size="sm"
            className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Quote settings */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Contractor</label>
              <select
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
              >
                <option value="">No contractor</option>
                {db.contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company ? `${c.company} — ` : ""}
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-gray-700">Tax rate (%)</label>
                <span className="text-xs text-gray-400">On taxable material sell only</span>
              </div>
              <Input
                type="number"
                className="h-10"
                value={taxRate}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                step="0.5"
                min="0"
              />
            </div>
          </div>

          {/* Routes */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Routes</h2>
              <Button variant="outline" size="sm" className="gap-1" onClick={addRoute}>
                <Plus className="h-4 w-4" /> Add Route
              </Button>
            </div>

            {routes.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-400">No routes yet.</p>
                <p className="text-xs text-gray-400">Add a route manually, open the map to pick a vendor, or create a new vendor.</p>
              </div>
            )}

            <div className="space-y-4">
              {routes.map((route, i) => (
                <RouteRow
                  key={route.id}
                  index={i}
                  route={route}
                  pickupVendors={pickupVendors}
                  materials={db.materials}
                  haulRates={db.haulRates}
                  brokerFeePercent={brokerFeePercent}
                  onChange={(patch) => updateRoute(i, patch)}
                  onMaterialsChange={(lines) => updateRouteMaterials(i, lines)}
                  onRequestNewVendor={() => {
                    setVendorRouteIndex(i);
                    setShowAddVendor(true);
                  }}
                  onRequestNewMaterial={(lineId) => {
                    setMaterialRouteIndex(i);
                    setMaterialLineId(lineId);
                    setShowAddMaterial(true);
                  }}
                  onRemove={() => removeRoute(i)}
                  routeCalc={calc.routes[i]}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary panel */}
      <div className="w-[280px] shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
        <div className="p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Summary</h2>

          <div className="space-y-2 text-sm">
            {routes.map((_, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-500">Route #{i + 1}</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(calc.routes[i]?.routeSubtotal ?? 0)}
                </span>
              </div>
            ))}
          </div>

          <div className="my-4 border-t border-gray-100" />

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Hauling (non-taxable)</span>
              <span>{formatCurrency(calc.haulSubtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Material</span>
              <span>{formatCurrency(calc.materialSubtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatCurrency(calc.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax on material ({taxRate}%)</span>
              <span>{formatCurrency(calc.tax)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 text-base">
              <span>Total</span>
              <span>{formatCurrency(calc.total)}</span>
            </div>
          </div>

          <div className="my-4 border-t border-gray-100" />

          <div className="space-y-1.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Gross Profit (Internal)
            </p>
            <div className="flex justify-between text-gray-500">
              <span>Broker income ({brokerFeePercent}% of haul buy)</span>
              <span className="text-green-700">{formatCurrency(calc.haulBrokerIncome)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Hauling GP</span>
              <span className={calc.haulingGP >= 0 ? "text-green-700" : "text-red-600"}>
                {formatCurrency(calc.haulingGP)}
              </span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Material GP</span>
              <span className={calc.materialGP >= 0 ? "text-green-700" : "text-red-600"}>
                {formatCurrency(calc.materialGP)}
              </span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900">
              <span>Total GP</span>
              <span>{formatCurrency(calc.totalGP)}</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              ⓘ Broker income is {brokerFeePercent}% of haul buy; hauling GP is sell minus net buy (buy − broker).
            </p>
          </div>
        </div>
      </div>

      {/* Vendor map overlay */}
      {showMap && (
        <VendorMap
          onClose={() => setShowMap(false)}
          onApplyToQuote={handleMapApply}
          projectAddress={project?.address}
          projectName={project?.name}
        />
      )}

      <CreateFormSheet
        open={showAddVendor}
        onOpenChange={(open) => {
          setShowAddVendor(open);
          if (!open) setVendorRouteIndex(null);
        }}
        title="Add new vendor"
        description="Adds a quarry or disposal site to pickup on this route."
        submitLabel="Save vendor"
        onSubmit={createVendorForRoute}
        disabled={!newVendorForm.name.trim()}
      >
        <FormSection title="Vendor" description="Pickup location">
          <FormField label="Vendor name" required>
            <Input
              className="h-10"
              value={newVendorForm.name}
              onChange={(e) => setNewVendorForm({ ...newVendorForm, name: e.target.value })}
              placeholder="e.g. Star Quarries"
            />
          </FormField>
          <FormField label="Address (pickup)">
            <Input
              className="h-10"
              value={newVendorForm.address}
              onChange={(e) => setNewVendorForm({ ...newVendorForm, address: e.target.value })}
              placeholder="Vendor address"
            />
          </FormField>
          <FormField label="Type">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={newVendorForm.type}
              onChange={(e) =>
                setNewVendorForm({
                  ...newVendorForm,
                  type: e.target.value as "quarry" | "disposal",
                })
              }
            >
              <option value="quarry">Quarry</option>
              <option value="disposal">Disposal</option>
            </select>
          </FormField>
        </FormSection>
      </CreateFormSheet>

      <CreateFormSheet
        open={showAddMaterial}
        onOpenChange={(open) => {
          setShowAddMaterial(open);
          if (!open) {
            setMaterialRouteIndex(null);
            setMaterialLineId(null);
          }
        }}
        title="Add material to catalog"
        description="Shared by name across quarries; links to this quarry when set."
        submitLabel="Save & apply"
        onSubmit={createMaterialForRoute}
        disabled={!newMaterialForm.name.trim()}
      >
        <FormSection title="Material" description="Catalog entry">
          <FormField label="Material name" required>
            <Input
              className="h-10"
              value={newMaterialForm.name}
              onChange={(e) => setNewMaterialForm({ ...newMaterialForm, name: e.target.value })}
              placeholder="e.g. #57 Stone"
            />
          </FormField>
          <FormField label="Buy price">
            <Input
              type="number"
              className="h-10"
              value={newMaterialForm.buy}
              onChange={(e) => setNewMaterialForm({ ...newMaterialForm, buy: e.target.value })}
              placeholder="0.00"
            />
          </FormField>
          <FormField label="Unit">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={newMaterialForm.unit}
              onChange={(e) =>
                setNewMaterialForm({
                  ...newMaterialForm,
                  unit: e.target.value as "TN" | "CY" | "LD" | "HR",
                })
              }
            >
              <option value="TN">Ton</option>
              <option value="CY">Cubic Yard</option>
              <option value="LD">Loads</option>
              <option value="HR">Hours</option>
            </select>
          </FormField>
        </FormSection>
      </CreateFormSheet>
    </div>
  );
}
