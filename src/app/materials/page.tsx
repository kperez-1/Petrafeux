"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Package,
  Search,
  Plus,
  Upload,
  Store,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { generateId } from "@/lib/utils";
import {
  Material,
  MATERIAL_PRICE_UNITS,
  DEFAULT_MATERIAL_PRICE_UNIT,
  MaterialPriceUnit,
  normalizeMaterialUnit,
} from "@/lib/types";
import { formatMaterialPrice, formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  PageHeader,
  PageActionCards,
  PageActionCard,
  PageToolbar,
  CreateFormSheet,
  FormSection,
  FormField,
} from "@/components/layout";

type ViewMode = "type" | "vendor";

interface TypeGroup {
  key: string;
  typeLabel: string;
  names: string[];
  rows: Material[];
  vendorCount: number;
  minPrice: number;
  maxPrice: number;
  sameUnit: boolean;
  unit?: MaterialPriceUnit;
}

interface VendorGroup {
  vendorId: string;
  vendorName: string;
  rows: Material[];
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

const UNTYPED_KEY = "__untyped__";

export default function MaterialsPage() {
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("type");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    name: "",
    type: "",
    vendorId: "",
    pricePerTon: "",
    priceUnit: DEFAULT_MATERIAL_PRICE_UNIT as MaterialPriceUnit,
  });

  const term = search.trim().toLowerCase();

  const vendorName = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of db.vendors) map.set(v.id, v.name);
    return map;
  }, [db.vendors]);

  const typeGroups = useMemo<TypeGroup[]>(() => {
    const groups = new Map<string, TypeGroup>();
    for (const m of db.materials) {
      const typeText = m.type?.trim() ?? "";
      const key = typeText ? normalizeKey(typeText) : UNTYPED_KEY;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          typeLabel: typeText || "Untyped",
          names: [],
          rows: [],
          vendorCount: 0,
          minPrice: Infinity,
          maxPrice: -Infinity,
          sameUnit: true,
          unit: undefined,
        };
        groups.set(key, g);
      }
      g.rows.push(m);
      if (m.name?.trim() && !g.names.includes(m.name.trim())) {
        g.names.push(m.name.trim());
      }
    }

    for (const g of groups.values()) {
      const vendorIds = new Set<string>();
      const units = new Set<MaterialPriceUnit>();
      for (const m of g.rows) {
        if (m.vendorId) vendorIds.add(m.vendorId);
        const u = normalizeMaterialUnit(m.priceUnit);
        units.add(u);
        if (m.pricePerTon > 0 || g.rows.length === 1) {
          g.minPrice = Math.min(g.minPrice, m.pricePerTon);
          g.maxPrice = Math.max(g.maxPrice, m.pricePerTon);
        }
      }
      g.vendorCount = vendorIds.size;
      g.sameUnit = units.size <= 1;
      g.unit = g.sameUnit ? [...units][0] : undefined;
      if (!isFinite(g.minPrice)) g.minPrice = 0;
      if (!isFinite(g.maxPrice)) g.maxPrice = 0;
      g.names.sort((a, b) => a.localeCompare(b));
    }

    return [...groups.values()].sort((a, b) => {
      if (a.key === UNTYPED_KEY) return 1;
      if (b.key === UNTYPED_KEY) return -1;
      return a.typeLabel.localeCompare(b.typeLabel);
    });
  }, [db.materials]);

  const filteredGroups = useMemo(
    () =>
      typeGroups.filter((g) =>
        term
          ? g.typeLabel.toLowerCase().includes(term) ||
            g.names.some((n) => n.toLowerCase().includes(term))
          : true
      ),
    [typeGroups, term]
  );

  const vendorGroups = useMemo<VendorGroup[]>(() => {
    const groups = new Map<string, VendorGroup>();
    for (const m of db.materials) {
      const vid = m.vendorId || "__none__";
      let g = groups.get(vid);
      if (!g) {
        g = {
          vendorId: vid,
          vendorName: vendorName.get(m.vendorId) || m.vendorName || "No vendor",
          rows: [],
        };
        groups.set(vid, g);
      }
      g.rows.push(m);
    }
    return [...groups.values()].sort((a, b) =>
      a.vendorName.localeCompare(b.vendorName)
    );
  }, [db.materials, vendorName]);

  const filteredVendorGroups = useMemo(
    () =>
      vendorGroups
        .map((g) => ({
          ...g,
          rows: term
            ? g.rows.filter((m) =>
                `${m.name} ${m.type}`.toLowerCase().includes(term)
              )
            : g.rows,
        }))
        .filter((g) => g.rows.length > 0),
    [vendorGroups, term]
  );

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function create() {
    if (!form.name.trim()) return;
    const vendor = db.vendors.find((v) => v.id === form.vendorId);
    const m: Material = {
      id: generateId(),
      name: form.name.trim(),
      type: form.type.trim(),
      vendorId: form.vendorId,
      vendorName: vendor?.name,
      pricePerTon: parseFloat(form.pricePerTon) || 0,
      priceUnit: form.priceUnit,
    };
    await save({ ...db, materials: [m, ...db.materials] });
    setForm({ name: "", type: "", vendorId: "", pricePerTon: "", priceUnit: DEFAULT_MATERIAL_PRICE_UNIT });
    setOpen(false);
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={Package}
        title="Materials"
        description="Shared material catalog — compare pricing across quarries"
      />

      <PageActionCards>
        <PageActionCard
          icon={Plus}
          title="New Material"
          description="Add a material to the shared catalog."
          buttonLabel="New Material"
          onClick={() => setOpen(true)}
        />
        <PageActionCard
          icon={Upload}
          title="Import Materials"
          description="Bulk-import materials from a spreadsheet."
          buttonLabel="Import"
          variant="outline"
          disabled
          disabledTitle="Coming soon"
        />
      </PageActionCards>

      <PageToolbar>
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="h-10 pl-9"
            placeholder="Search materials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setView("type")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "type"
                ? "bg-[#0f6b4f] text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            By type
          </button>
          <button
            type="button"
            onClick={() => setView("vendor")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "vendor"
                ? "bg-[#0f6b4f] text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            By quarry
          </button>
        </div>
      </PageToolbar>

      {view === "type" ? (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Material names</th>
                <th className="px-4 py-3 text-left font-medium">Quarries</th>
                <th className="px-4 py-3 text-left font-medium">Price range</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    No materials yet.
                  </td>
                </tr>
              )}
              {filteredGroups.map((g) => {
                const isOpen = expanded.has(g.key);
                const priceLabel = g.sameUnit
                  ? g.minPrice === g.maxPrice
                    ? formatMaterialPrice(g.minPrice, g.unit)
                    : `${formatCurrency(g.minPrice)} – ${formatCurrency(g.maxPrice)} / ${normalizeMaterialUnit(g.unit)}`
                  : "Varies (mixed units)";
                const sortedRows = [...g.rows].sort(
                  (a, b) => a.pricePerTon - b.pricePerTon
                );
                const lowest = sortedRows[0]?.pricePerTon;
                const showLowest =
                  g.sameUnit && g.rows.length > 1 && g.minPrice !== g.maxPrice;
                return (
                  <FragmentRow key={g.key}>
                    <tr
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggle(g.key)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <span className="inline-flex items-center gap-1.5">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          {g.typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {g.names.length ? g.names.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <span className="inline-flex items-center gap-1.5">
                          <Store className="h-3.5 w-3.5 text-gray-400" />
                          {g.vendorCount} quarr{g.vendorCount === 1 ? "y" : "ies"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{priceLabel}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={4} className="px-4 py-3">
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                                  <th className="px-3 py-2 text-left font-medium">Material name</th>
                                  <th className="px-3 py-2 text-left font-medium">Quarry</th>
                                  <th className="px-3 py-2 text-left font-medium">Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sortedRows.map((m) => {
                                  const isLowest =
                                    showLowest && m.pricePerTon === lowest;
                                  return (
                                    <tr
                                      key={m.id}
                                      className="border-b border-gray-50 last:border-0"
                                    >
                                      <td className="px-3 py-2 font-medium text-gray-900">
                                        {m.name || "—"}
                                      </td>
                                      <td className="px-3 py-2">
                                        {m.vendorId ? (
                                          <Link
                                            href={`/vendors/${m.vendorId}`}
                                            className="text-[#0f6b4f] hover:underline"
                                          >
                                            {vendorName.get(m.vendorId) ||
                                              m.vendorName ||
                                              "Unknown"}
                                          </Link>
                                        ) : (
                                          <span className="text-gray-400">
                                            No vendor
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-gray-700">
                                        <span className="inline-flex items-center gap-2">
                                          {formatMaterialPrice(
                                            m.pricePerTon,
                                            normalizeMaterialUnit(m.priceUnit)
                                          )}
                                          {isLowest && (
                                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                              Lowest
                                            </span>
                                          )}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVendorGroups.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-gray-400">
              No materials yet.
            </div>
          )}
          {filteredVendorGroups.map((g) => (
            <div
              key={g.vendorId}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-gray-400" />
                  {g.vendorId !== "__none__" ? (
                    <Link
                      href={`/vendors/${g.vendorId}`}
                      className="font-medium text-gray-900 hover:text-[#0f6b4f]"
                    >
                      {g.vendorName}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-500">{g.vendorName}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {g.rows.length} material{g.rows.length !== 1 ? "s" : ""}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2 text-left font-medium">Name</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                    <th className="px-4 py-2 text-left font-medium">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2 font-medium text-gray-900">{m.name}</td>
                      <td className="px-4 py-2 text-gray-500">{m.type || "—"}</td>
                      <td className="px-4 py-2 text-gray-700">
                        {formatMaterialPrice(
                          m.pricePerTon,
                          normalizeMaterialUnit(m.priceUnit)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <CreateFormSheet
        open={open}
        onOpenChange={setOpen}
        title="New Material"
        description="Add to the shared catalog (deduped by name)."
        submitLabel="Create Material"
        onSubmit={create}
        disabled={!form.name.trim()}
      >
        <FormSection title="Material" description="Name, vendor link, and pricing">
          <FormField label="Name" required>
            <Input
              className="h-10"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. #57 Stone"
            />
          </FormField>
          <FormField label="Type">
            <Input
              className="h-10"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              placeholder="e.g. aggregate"
            />
          </FormField>
          <FormField label="Vendor">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={form.vendorId}
              onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
            >
              <option value="">No vendor</option>
              {db.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Unit">
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={form.priceUnit}
              onChange={(e) =>
                setForm({ ...form, priceUnit: e.target.value as MaterialPriceUnit })
              }
            >
              {MATERIAL_PRICE_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Price">
            <Input
              type="number"
              className="h-10"
              value={form.pricePerTon}
              onChange={(e) => setForm({ ...form, pricePerTon: e.target.value })}
              placeholder="0.00"
            />
          </FormField>
        </FormSection>
      </CreateFormSheet>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
