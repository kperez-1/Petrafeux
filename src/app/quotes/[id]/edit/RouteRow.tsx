"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Route, Trash2, Plus, Minus } from "lucide-react";
import {
  QuoteRoute,
  Vendor,
  Material,
  HaulRate,
  MaterialPriceUnit,
  RouteMaterialLine,
  normalizeMaterialUnit,
  unitQtyLabel,
  unitRateLabel,
} from "@/lib/types";
import {
  calcRouteMaterialSubtotal,
  suggestHaulRatesFromAddresses,
  haulBrokerIncomePerTon,
  netHaulBuyRate,
  haulGpPercent,
  haulSellFromBuyGp,
  materialGpPercent,
  materialSellFromBuyGp,
  allInUnitRate,
  DEFAULT_HAUL_GP_PERCENT,
  DEFAULT_MATERIAL_GP_PERCENT,
} from "@/lib/quote-calc";
import {
  getRouteMaterials,
  catalogMaterials,
  applyCatalogMaterialToLine,
  emptyMaterialLine,
  materialVendorIds,
} from "@/lib/route-materials";
import { haulBuyRateForUnit } from "@/lib/haul-pricing";
import { formatCurrency, roundCents, ceilCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const CUSTOM_PICKUP = "__custom__";
export const ADD_NEW_VENDOR = "__new_vendor__";
export const ADD_NEW_MATERIAL = "__new_material__";
/** Quote-only material line (not linked to catalog). */
export const CUSTOM_MATERIAL = "__custom_material__";

const ROUTE_UNIT_OPTIONS: { value: MaterialPriceUnit; label: string }[] = [
  { value: "TN", label: "Ton" },
  { value: "CY", label: "Cubic Yard" },
  { value: "LD", label: "Loads" },
  { value: "HR", label: "Hours" },
];

function pickupSelectValue(route: QuoteRoute, vendors: Vendor[]): string {
  if (route.pickupVendorId && vendors.some((v) => v.id === route.pickupVendorId)) {
    return route.pickupVendorId;
  }
  if (route.pickupAddress.trim()) {
    const match = vendors.find(
      (v) => v.address.trim() && v.address.trim() === route.pickupAddress.trim()
    );
    if (match) return match.id;
    return CUSTOM_PICKUP;
  }
  return "";
}

function GpStepper({
  gp,
  onDecrease,
  onIncrease,
}: {
  gp: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-gray-200 bg-white">
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center text-gray-500 hover:bg-gray-100"
        onClick={onDecrease}
        aria-label="Decrease GP"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[72px] px-1 text-center text-xs font-medium text-gray-700">
        {gp.toFixed(1)}% GP
      </span>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center text-gray-500 hover:bg-gray-100"
        onClick={onIncrease}
        aria-label="Increase GP"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface MaterialLineRowProps {
  line: RouteMaterialLine;
  lineIndex: number;
  catalog: Material[];
  canRemove: boolean;
  onChange: (patch: Partial<RouteMaterialLine>) => void;
  onRemove: () => void;
  onRequestNewMaterial: () => void;
}

function materialSelectValue(line: RouteMaterialLine, catalog: Material[]): string {
  if (line.materialId && catalog.some((m) => m.id === line.materialId)) {
    return line.materialId;
  }
  if (line.materialName?.trim() || line.materialRate > 0 || line.materialCost > 0) {
    return CUSTOM_MATERIAL;
  }
  return "";
}

function MaterialLineRow({
  line,
  lineIndex,
  catalog,
  canRemove,
  onChange,
  onRemove,
  onRequestNewMaterial,
}: MaterialLineRowProps) {
  const unit = normalizeMaterialUnit(line.materialUnit);
  const gp = materialGpPercent(line.materialRate, line.materialCost);
  const subtotal = line.materialCost * line.materialQty;
  const selectValue = materialSelectValue(line, catalog);

  function adjustGp(delta: number) {
    const next = Math.max(0, Math.min(99, gp + delta));
    onChange({ materialCost: roundCents(materialSellFromBuyGp(line.materialRate, next)) });
  }

  return (
    <div
      className={
        lineIndex > 0
          ? "mt-3 rounded-md border border-gray-200 bg-white p-3"
          : "rounded-md border border-transparent"
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">
          {lineIndex === 0 ? "Material" : `Material #${lineIndex + 1}`}
        </span>
        <div className="flex items-center gap-2">
          <GpStepper gp={gp} onDecrease={() => adjustGp(-1)} onIncrease={() => adjustGp(1)} />
          <select
            className="max-w-[200px] rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === ADD_NEW_MATERIAL) {
                onRequestNewMaterial();
                return;
              }
              if (v === CUSTOM_MATERIAL) {
                onChange({
                  materialId: undefined,
                  materialName: line.materialName ?? "",
                  materialType: line.materialType ?? "",
                });
                return;
              }
              if (!v) {
                onChange({
                  materialId: undefined,
                  materialName: "",
                  materialType: "",
                  materialRate: 0,
                  materialCost: 0,
                });
                return;
              }
              const m = catalog.find((x) => x.id === v);
              if (m) onChange(applyCatalogMaterialToLine(m));
            }}
          >
            <option value="">—</option>
            <option value={CUSTOM_MATERIAL}>Custom (quote only)…</option>
            <option value={ADD_NEW_MATERIAL}>+ Save to catalog…</option>
            {catalog.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-gray-300 hover:text-red-500"
              aria-label="Remove material"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mb-2 space-y-1">
        <label className="text-xs text-gray-500">Name on quote</label>
        <Input
          className="text-sm"
          placeholder="Material name visible on quote"
          value={line.materialName ?? ""}
          onChange={(e) => onChange({ materialName: e.target.value })}
        />
        <p className="text-[10px] text-gray-400">
          Pick a catalog material for pricing, or choose Custom and type any name here.
        </p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Unit</label>
          <select
            className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
            value={unit}
            onChange={(e) =>
              onChange({ materialUnit: e.target.value as MaterialPriceUnit })
            }
          >
            {ROUTE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Qty ({unitQtyLabel(unit)})</label>
          <Input
            type="number"
            value={line.materialQty}
            onChange={(e) => onChange({ materialQty: parseFloat(e.target.value) || 0 })}
            className="text-sm"
            min="0"
            step="0.5"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Buy ({unitRateLabel(unit)})</label>
          <Input
            type="number"
            value={line.materialRate}
            onChange={(e) => {
              const buy = parseFloat(e.target.value) || 0;
              const keepGp = line.materialCost > 0 ? gp : DEFAULT_MATERIAL_GP_PERCENT;
              onChange({
                materialRate: buy,
                materialCost: roundCents(materialSellFromBuyGp(buy, keepGp)),
              });
            }}
            className="text-sm"
            min="0"
            step="0.01"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Sell ({unitRateLabel(unit)})</label>
          <Input
            type="number"
            value={line.materialCost}
            onChange={(e) => onChange({ materialCost: parseFloat(e.target.value) || 0 })}
            className="text-sm"
            min="0"
            step="0.01"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Subtotal</label>
          <div className="flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700">
            {formatCurrency(subtotal)}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface RouteRowProps {
  index: number;
  route: QuoteRoute;
  pickupVendors: Vendor[];
  materials: Material[];
  haulRates: HaulRate[];
  brokerFeePercent: number;
  onChange: (patch: Partial<QuoteRoute>) => void;
  onMaterialsChange: (lines: RouteMaterialLine[]) => void;
  onRequestNewVendor: () => void;
  onRequestNewMaterial: (lineId: string) => void;
  onRemove: () => void;
  routeCalc?: {
    haulSubtotal: number;
    materialSubtotal: number;
    routeSubtotal: number;
  };
}

export function RouteRow({
  index,
  route,
  pickupVendors,
  materials,
  haulRates,
  brokerFeePercent,
  onChange,
  onMaterialsChange,
  onRequestNewVendor,
  onRequestNewMaterial,
  onRemove,
  routeCalc,
}: RouteRowProps) {
  const [expanded, setExpanded] = useState(true);
  const [haulLoading, setHaulLoading] = useState(false);
  const [haulHint, setHaulHint] = useState<string | null>(null);
  const pickupValue = pickupSelectValue(route, pickupVendors);
  const showCustomPickup = pickupValue === CUSTOM_PICKUP;
  const haulUnit = normalizeMaterialUnit(route.haulUnit);
  const haulGp = haulGpPercent(route.haulCost, route.haulRate, brokerFeePercent);
  const materialLines = getRouteMaterials(route);
  const quarryMaterials = route.pickupVendorId
    ? materials.filter((m) => materialVendorIds(m).includes(route.pickupVendorId!))
    : materials;
  /** Prefer quarry-specific rows (no cross-quarry name collapse when filtered). */
  const catalog = route.pickupVendorId
    ? [...quarryMaterials].sort((a, b) => a.name.localeCompare(b.name))
    : catalogMaterials(materials);

  const pickupVendor = pickupVendors.find((v) => v.id === route.pickupVendorId);
  const pickupLabel = pickupVendor?.name || route.pickupAddress.trim() || "No pickup set";
  const materialNames = materialLines
    .map((l) => l.materialName?.trim())
    .filter((n): n is string => Boolean(n));
  const routeSummary = materialNames.length
    ? `${pickupLabel} · ${materialNames.join(", ")}`
    : `${pickupLabel} · Hauling only`;

  const allInLines = materialLines.map((l) => ({
    id: l.id,
    name: l.materialName?.trim() || "Material",
    rate: allInUnitRate(l.materialCost, l.materialUnit, route.haulRate, route.haulUnit),
  }));

  function allInLabel(rate: ReturnType<typeof allInUnitRate>): string {
    return rate.combined != null
      ? `${formatCurrency(rate.combined)} ${unitRateLabel(rate.unit)}`
      : `${formatCurrency(rate.materialSell)} ${unitRateLabel(rate.unit)} + haul ${formatCurrency(rate.haulSell)} ${unitRateLabel(rate.haulUnit)}`;
  }

  async function calcHaulFromAddresses() {
    if (!route.pickupAddress.trim() || !route.dropoffAddress.trim()) {
      setHaulHint("Enter pickup and dropoff addresses first.");
      return;
    }
    setHaulLoading(true);
    setHaulHint(null);
    try {
      const suggestion = await suggestHaulRatesFromAddresses(
        route.pickupAddress,
        route.dropoffAddress,
        haulRates,
        haulUnit
      );
      if (!suggestion) {
        setHaulHint("Could not geocode addresses or find a haul rate for this distance.");
        return;
      }
      const buy = ceilCents(suggestion.buyRate);
      const sell = roundCents(
        haulSellFromBuyGp(buy, brokerFeePercent, DEFAULT_HAUL_GP_PERCENT)
      );
      onChange({
        haulCost: buy,
        haulRate: sell,
        haulMiles: suggestion.miles,
        haulRatePerLoad: suggestion.ratePerLoad,
      });
      setHaulHint(
        `${suggestion.miles} mi ${suggestion.approximate ? "(approx)" : "road"} · ${suggestion.mileLabel} · $${suggestion.ratePerLoad.toFixed(2)}/load · buy ${formatCurrency(buy)}/${haulUnit} · sell ${formatCurrency(sell)}/${haulUnit} · ${DEFAULT_HAUL_GP_PERCENT}% GP`
      );
    } finally {
      setHaulLoading(false);
    }
  }

  function adjustHaulGp(delta: number) {
    const next = Math.max(0, Math.min(99, haulGp + delta));
    onChange({
      haulRate: roundCents(haulSellFromBuyGp(route.haulCost, brokerFeePercent, next)),
    });
  }

  function updateLine(lineId: string, patch: Partial<RouteMaterialLine>) {
    onMaterialsChange(
      materialLines.map((l) => (l.id === lineId ? { ...l, ...patch } : l))
    );
  }

  function removeLine(lineId: string) {
    onMaterialsChange(materialLines.filter((l) => l.id !== lineId));
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <span className="text-sm font-medium text-gray-700">Route #{index + 1}</span>
        <div className="flex-1 truncate text-xs text-gray-400">{routeSummary}</div>
        <span className="text-sm font-semibold text-gray-900">
          {formatCurrency(routeCalc?.routeSubtotal ?? 0)}
        </span>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-gray-400 hover:text-gray-700">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-500">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* All-in (material + hauling) per material */}
      <div className="space-y-1 border-b border-gray-100 px-4 py-2">
        {allInLines.length === 0 ? (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Hauling only</span>
            <span className="font-medium text-gray-700">
              {formatCurrency(route.haulRate)} {unitRateLabel(normalizeMaterialUnit(route.haulUnit))}
            </span>
          </div>
        ) : (
          allInLines.map((al) => (
            <div key={al.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-gray-500">{al.name}</span>
              <span className="shrink-0 font-medium text-gray-700">
                all-in {allInLabel(al.rate)}
              </span>
            </div>
          ))
        )}
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Pickup (From)</label>
              <select
                className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                value={pickupValue === ADD_NEW_VENDOR ? "" : pickupValue}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id === ADD_NEW_VENDOR) {
                    onRequestNewVendor();
                    return;
                  }
                  if (!id) {
                    onChange({ pickupVendorId: undefined, pickupAddress: "" });
                  } else if (id === CUSTOM_PICKUP) {
                    onChange({ pickupVendorId: undefined });
                  } else {
                    const v = pickupVendors.find((x) => x.id === id);
                    onChange({
                      pickupVendorId: id,
                      pickupAddress: v?.address ?? "",
                    });
                  }
                }}
              >
                <option value="">Select quarry…</option>
                <option value={ADD_NEW_VENDOR}>+ Add new vendor…</option>
                {pickupVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.address ? ` · ${v.address}` : ""}
                  </option>
                ))}
                <option value={CUSTOM_PICKUP}>Other address…</option>
              </select>
              {showCustomPickup && (
                <Input
                  placeholder="Pickup address"
                  value={route.pickupAddress}
                  onChange={(e) => onChange({ pickupAddress: e.target.value })}
                  className="text-sm"
                />
              )}
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

          <div className="rounded-lg bg-gray-50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                Hauling
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <GpStepper
                  gp={haulGp}
                  onDecrease={() => adjustHaulGp(-1)}
                  onIncrease={() => adjustHaulGp(1)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={calcHaulFromAddresses}
                  disabled={haulLoading}
                >
                  {haulLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Route className="h-3 w-3" />
                  )}
                  Calc haul rate
                </Button>
              </div>
            </div>
            {haulHint && <p className="mb-2 text-[10px] text-gray-500">{haulHint}</p>}
            <div className="grid grid-cols-5 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Unit</label>
                <select
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                  value={haulUnit}
                  onChange={(e) => {
                    const nextUnit = e.target.value as MaterialPriceUnit;
                    // Re-derive buy/sell for the new unit from the same haul
                    // miles (per-load base rate), preserving the current GP%.
                    if (route.haulRatePerLoad && route.haulRatePerLoad > 0) {
                      const buy = ceilCents(
                        haulBuyRateForUnit(route.haulRatePerLoad, nextUnit)
                      );
                      const keepGp = route.haulRate > 0 ? haulGp : DEFAULT_HAUL_GP_PERCENT;
                      const sell = roundCents(
                        haulSellFromBuyGp(buy, brokerFeePercent, keepGp)
                      );
                      onChange({ haulUnit: nextUnit, haulCost: buy, haulRate: sell });
                    } else {
                      onChange({ haulUnit: nextUnit });
                    }
                  }}
                >
                  {ROUTE_UNIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Qty ({unitQtyLabel(haulUnit)})</label>
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
                <label className="text-xs text-gray-500">Buy ({unitRateLabel(haulUnit)})</label>
                <Input
                  type="number"
                  value={route.haulCost}
                  onChange={(e) => {
                    const buy = parseFloat(e.target.value) || 0;
                    const keepGp = route.haulRate > 0 ? haulGp : DEFAULT_HAUL_GP_PERCENT;
                    onChange({
                      haulCost: buy,
                      haulRate: roundCents(haulSellFromBuyGp(buy, brokerFeePercent, keepGp)),
                    });
                  }}
                  className="text-sm"
                  min="0"
                  step="0.01"
                />
                {route.haulCost > 0 && haulUnit === "TN" && (
                  <p className="text-[10px] text-gray-400">
                    Broker {formatCurrency(haulBrokerIncomePerTon(route.haulCost, brokerFeePercent))}
                    /TN · Net buy {formatCurrency(netHaulBuyRate(route.haulCost, brokerFeePercent))}/TN
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Sell ({unitRateLabel(haulUnit)})</label>
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
                <label className="text-xs text-gray-500">Subtotal</label>
                <div className="flex min-h-9 flex-col justify-center rounded-md border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700">
                  {formatCurrency(routeCalc?.haulSubtotal ?? route.haulRate * route.haulQty)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                Materials
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => onMaterialsChange([...materialLines, emptyMaterialLine()])}
              >
                <Plus className="h-3 w-3" /> Add material
              </Button>
            </div>
            {materialLines.length === 0 ? (
              <p className="text-xs text-gray-400">
                No materials on this route. Add one or pick from the catalog.
              </p>
            ) : (
              materialLines.map((line, li) => (
                <MaterialLineRow
                  key={line.id}
                  line={line}
                  lineIndex={li}
                  catalog={catalog}
                  canRemove={materialLines.length > 0}
                  onChange={(patch) => updateLine(line.id, patch)}
                  onRemove={() => removeLine(line.id)}
                  onRequestNewMaterial={() => onRequestNewMaterial(line.id)}
                />
              ))
            )}
            {route.pickupVendorId && catalog.length === 0 && (
              <p className="mt-2 text-[10px] text-amber-700">
                No materials at this quarry — add them on the vendor page, or use Custom.
              </p>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`taxable-${route.id}`}
                  checked={route.taxable}
                  onChange={(e) => onChange({ taxable: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-[#0f6b4f]"
                />
                <label htmlFor={`taxable-${route.id}`} className="text-xs text-gray-500">
                  Material taxable
                </label>
              </div>
              <span className="text-xs font-medium text-gray-600">
                Materials {formatCurrency(routeCalc?.materialSubtotal ?? calcRouteMaterialSubtotal(route))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
