"use client";

import { use, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, MapPin, X, ChevronDown, ChevronUp } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { QuoteRoute, Vendor, Material } from "@/lib/types";
import { generateId, formatCurrency } from "@/lib/utils";
import { calcQuote, lookupHaulRate } from "@/lib/quote-calc";
import { VendorMap } from "@/components/VendorMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
    materialId: undefined,
    materialName: "",
    materialType: "",
    materialRate: 0,
    materialCost: 0,
    materialQty: 1,
    taxable: true,
  };
}

export default function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, save } = useDb();

  const quote = db.quotes.find((q) => q.id === id);
  const project = quote ? db.projects.find((p) => p.id === quote.projectId) : null;

  const [routes, setRoutes] = useState<QuoteRoute[]>(quote?.routes ?? []);
  const [taxRate, setTaxRate] = useState(quote?.taxRate ?? 7);
  const [showMap, setShowMap] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newVendorForm, setNewVendorForm] = useState<{ name: string; address: string; type: "quarry" | "disposal"; materialName: string; materialPrice: string }>({ name: "", address: "", type: "quarry", materialName: "", materialPrice: "" });

  if (!quote) {
    return (
      <div className="p-8 text-gray-400">
        Quote not found.{" "}
        <Link href="/quotes" className="text-[#0f6b4f] underline">Back to quotes</Link>
      </div>
    );
  }

  const calc = calcQuote({ ...quote, routes, taxRate });

  function updateRoute(index: number, patch: Partial<QuoteRoute>) {
    setRoutes((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRoute() {
    setRoutes((prev) => [...prev, emptyRoute(quote!.id, prev.length)]);
  }

  function removeRoute(index: number) {
    setRoutes((prev) => prev.filter((_, i) => i !== index));
  }

  function applyMaterial(index: number, material: Material) {
    updateRoute(index, {
      materialId: material.id,
      materialName: material.name,
      materialType: material.type,
      materialRate: material.pricePerTon,
      materialCost: material.pricePerTon, // default sell = buy, user adjusts margin
    });
  }

  // Called from VendorMap when user clicks "Add to quote"
  const handleMapAdd = useCallback((vendor: Vendor, material: Material) => {
    const newRoute: QuoteRoute = {
      ...emptyRoute(quote.id, routes.length),
      pickupAddress: vendor.address,
      dropoffAddress: project?.address ?? "",
      materialId: material.id,
      materialName: material.name,
      materialType: material.type,
      materialRate: material.pricePerTon,
      materialCost: material.pricePerTon,
    };
    setRoutes((prev) => [...prev, newRoute]);
    setShowMap(false);
  }, [quote.id, routes.length, project?.address]);

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        ...db,
        quotes: db.quotes.map((q) =>
          q.id === id ? { ...q, routes, taxRate } : q
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  async function createAndAddVendor() {
    if (!newVendorForm.name.trim()) return;
    const { generateId } = await import("@/lib/utils");
    const vendorId = generateId();
    const materialId = generateId();
    const newVendor: Vendor = {
      id: vendorId,
      name: newVendorForm.name.trim(),
      address: newVendorForm.address.trim(),
      type: newVendorForm.type,
    };
    const newMaterial: Material = {
      id: materialId,
      vendorId,
      name: newVendorForm.materialName.trim() || "Material",
      type: "",
      pricePerTon: parseFloat(newVendorForm.materialPrice) || 0,
    };
    const newRoute: QuoteRoute = {
      ...emptyRoute(quote!.id, routes.length),
      pickupAddress: newVendor.address,
      dropoffAddress: project?.address ?? "",
      materialId,
      materialName: newMaterial.name,
      materialRate: newMaterial.pricePerTon,
      materialCost: newMaterial.pricePerTon,
    };
    await save({ ...db, vendors: [...db.vendors, newVendor], materials: [...db.materials, newMaterial] });
    setRoutes((prev) => [...prev, newRoute]);
    setNewVendorForm({ name: "", address: "", type: "quarry", materialName: "", materialPrice: "" });
    setShowAddVendor(false);
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
          {/* Tax rate */}
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Tax Rate (%)</label>
            <Input
              type="number"
              className="w-24"
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              step="0.5"
              min="0"
            />
          </div>

          {/* Routes */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Routes</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setShowAddVendor(true)}
                >
                  <Plus className="h-4 w-4" /> New Vendor + Route
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={addRoute}
                >
                  <Plus className="h-4 w-4" /> Add Route
                </Button>
              </div>
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
                  materials={db.materials}
                  haulRates={db.haulRates}
                  onChange={(patch) => updateRoute(i, patch)}
                  onApplyMaterial={(m) => applyMaterial(i, m)}
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
              <span>Subtotal</span>
              <span>{formatCurrency(calc.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax ({taxRate}%)</span>
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
              ⓘ Brokerage Fee/Rate (5%–10%) is not considered at this stage.
            </p>
          </div>
        </div>
      </div>

      {/* Vendor map overlay */}
      {showMap && (
        <VendorMap
          onClose={() => setShowMap(false)}
          onAddToQuote={handleMapAdd}
          projectAddress={project?.address}
        />
      )}

      {/* Add new vendor drawer */}
      <Sheet open={showAddVendor} onOpenChange={setShowAddVendor}>
        <SheetContent className="w-[400px]">
          <SheetHeader>
            <SheetTitle>Add New Vendor + Route</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Vendor Name *</label>
              <Input value={newVendorForm.name} onChange={(e) => setNewVendorForm({ ...newVendorForm, name: e.target.value })} placeholder="e.g. Star Quarries" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Address (Pickup)</label>
              <Input value={newVendorForm.address} onChange={(e) => setNewVendorForm({ ...newVendorForm, address: e.target.value })} placeholder="Vendor address" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" value={newVendorForm.type} onChange={(e) => setNewVendorForm({ ...newVendorForm, type: e.target.value as "quarry" | "disposal" })}>
                <option value="quarry">Quarry</option>
                <option value="disposal">Disposal</option>
              </select>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Material</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Material Name</label>
                  <Input value={newVendorForm.materialName} onChange={(e) => setNewVendorForm({ ...newVendorForm, materialName: e.target.value })} placeholder="e.g. #57 Stone" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Buy Price ($/ton)</label>
                  <Input type="number" value={newVendorForm.materialPrice} onChange={(e) => setNewVendorForm({ ...newVendorForm, materialPrice: e.target.value })} placeholder="0.00" />
                </div>
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex gap-3 border-t bg-white p-4">
            <Button className="flex-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white" onClick={createAndAddVendor} disabled={!newVendorForm.name.trim()}>
              Create & Add to Quote
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowAddVendor(false)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Route Row Component ────────────────────────────────────────────────────────

interface RouteRowProps {
  index: number;
  route: QuoteRoute;
  materials: Material[];
  haulRates: { minMiles: number; maxMiles: number; ratePerTon: number }[];
  onChange: (patch: Partial<QuoteRoute>) => void;
  onApplyMaterial: (m: Material) => void;
  onRemove: () => void;
  routeCalc?: { haulSubtotal: number; materialSubtotal: number; routeSubtotal: number };
}

function RouteRow({ index, route, materials, haulRates, onChange, onApplyMaterial, onRemove, routeCalc }: RouteRowProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <span className="text-sm font-medium text-gray-700">Route #{index + 1}</span>
        <div className="flex-1 text-xs text-gray-400 truncate">
          {route.pickupAddress && route.dropoffAddress
            ? `${route.pickupAddress} → ${route.dropoffAddress}`
            : "No addresses set"}
        </div>
        <span className="text-sm font-semibold text-gray-900">
          {formatCurrency(routeCalc?.routeSubtotal ?? 0)}
        </span>
        <button onClick={() => setExpanded((v) => !v)} className="text-gray-400 hover:text-gray-700">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Addresses */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Pickup (From)</label>
              <Input
                placeholder="Quarry address"
                value={route.pickupAddress}
                onChange={(e) => onChange({ pickupAddress: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Dropoff (To)</label>
              <Input
                placeholder="Job site address"
                value={route.dropoffAddress}
                onChange={(e) => onChange({ dropoffAddress: e.target.value })}
                className="text-sm"
              />
            </div>
          </div>

          {/* Hauling section */}
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">Hauling</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Qty (tons)</label>
                <Input
                  type="number"
                  value={route.haulQty}
                  onChange={(e) => onChange({ haulQty: parseFloat(e.target.value) || 0 })}
                  className="text-sm"
                  min="0"
                  step="0.5"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Sell Rate ($/ton)</label>
                <Input
                  type="number"
                  value={route.haulRate}
                  onChange={(e) => onChange({ haulRate: parseFloat(e.target.value) || 0 })}
                  className="text-sm"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Cost Rate ($/ton)</label>
                <Input
                  type="number"
                  value={route.haulCost}
                  onChange={(e) => onChange({ haulCost: parseFloat(e.target.value) || 0 })}
                  className="text-sm"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Subtotal</label>
                <div className="flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700">
                  {formatCurrency(route.haulRate * route.haulQty)}
                </div>
              </div>
            </div>
          </div>

          {/* Material section */}
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">Material</span>
              <select
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                value={route.materialId ?? ""}
                onChange={(e) => {
                  const m = materials.find((m) => m.id === e.target.value);
                  if (m) onApplyMaterial(m);
                }}
              >
                <option value="">Pick from catalog…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Qty (tons)</label>
                <Input
                  type="number"
                  value={route.materialQty}
                  onChange={(e) => onChange({ materialQty: parseFloat(e.target.value) || 0 })}
                  className="text-sm"
                  min="0"
                  step="0.5"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Buy ($/ton)</label>
                <Input
                  type="number"
                  value={route.materialRate}
                  onChange={(e) => onChange({ materialRate: parseFloat(e.target.value) || 0 })}
                  className="text-sm"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Sell ($/ton)</label>
                <Input
                  type="number"
                  value={route.materialCost}
                  onChange={(e) => onChange({ materialCost: parseFloat(e.target.value) || 0 })}
                  className="text-sm"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Subtotal</label>
                <div className="flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700">
                  {formatCurrency(route.materialCost * route.materialQty)}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id={`taxable-${route.id}`}
                checked={route.taxable}
                onChange={(e) => onChange({ taxable: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-[#0f6b4f]"
              />
              <label htmlFor={`taxable-${route.id}`} className="text-xs text-gray-500">Taxable</label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
