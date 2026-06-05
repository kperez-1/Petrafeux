"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  Store,
  MapPin,
  TriangleAlert,
  Plus,
  Package,
  ArrowLeft,
  Camera,
  X,
} from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { generateId } from "@/lib/utils";
import { filesToResizedDataUrls } from "@/lib/image-utils";
import {
  Material,
  Vendor,
  MATERIAL_PRICE_UNITS,
  DEFAULT_MATERIAL_PRICE_UNIT,
  MaterialPriceUnit,
  normalizeMaterialUnit,
} from "@/lib/types";
import { geocodeAddress } from "@/lib/quote-calc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VendorFormSheet } from "@/components/VendorFormSheet";
import { Pencil } from "lucide-react";

function hasCoords(v: Vendor): boolean {
  return (
    typeof v.lat === "number" &&
    isFinite(v.lat) &&
    typeof v.lng === "number" &&
    isFinite(v.lng)
  );
}

export default function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, save } = useDb();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "",
    pricePerTon: "",
    priceUnit: DEFAULT_MATERIAL_PRICE_UNIT as MaterialPriceUnit,
    photos: [] as string[],
  });
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [editingTypes, setEditingTypes] = useState<Record<string, string>>({});
  const [vendorEditOpen, setVendorEditOpen] = useState(false);

  const vendor = db.vendors.find((v) => v.id === id);
  const materials = db.materials.filter((m) => m.vendorId === id);

  if (!vendor) {
    return (
      <div className="p-8 text-gray-400">
        Vendor not found.{" "}
        <Link href="/vendors" className="text-[#0f6b4f] underline">
          Back to vendors
        </Link>
      </div>
    );
  }

  async function createMaterial() {
    if (!form.name.trim() || !vendor) return;
    const m: Material = {
      id: generateId(),
      name: form.name.trim(),
      type: form.type.trim(),
      vendorId: vendor.id,
      vendorName: vendor.name,
      pricePerTon: parseFloat(form.pricePerTon) || 0,
      priceUnit: form.priceUnit,
      photos: form.photos.length ? form.photos : undefined,
    };
    await save({ ...db, materials: [m, ...db.materials] });
    setForm({ name: "", type: "", pricePerTon: "", priceUnit: DEFAULT_MATERIAL_PRICE_UNIT, photos: [] });
    setOpen(false);
  }

  async function updateMaterial(
    materialId: string,
    patch: Partial<Pick<Material, "pricePerTon" | "priceUnit" | "name" | "type" | "photos">>
  ) {
    await save({
      ...db,
      materials: db.materials.map((m) =>
        m.id === materialId ? { ...m, ...patch } : m
      ),
    });
  }

  async function addPhotosToMaterial(materialId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const urls = await filesToResizedDataUrls(files);
    if (urls.length === 0) return;
    const existing = db.materials.find((m) => m.id === materialId)?.photos ?? [];
    await updateMaterial(materialId, { photos: [...existing, ...urls] });
  }

  async function removePhotoFromMaterial(materialId: string, index: number) {
    const existing = db.materials.find((m) => m.id === materialId)?.photos ?? [];
    const next = existing.filter((_, i) => i !== index);
    await updateMaterial(materialId, { photos: next.length ? next : undefined });
  }

  async function addPhotosToForm(files: FileList | null) {
    if (!files || files.length === 0) return;
    const urls = await filesToResizedDataUrls(files);
    if (urls.length === 0) return;
    setForm((f) => ({ ...f, photos: [...f.photos, ...urls] }));
  }

  async function regeocode() {
    if (!vendor?.address.trim()) return;
    const coords = await geocodeAddress(vendor.address.trim());
    if (!coords) return;
    const updated: Vendor = { ...vendor, lat: coords.lat, lng: coords.lng };
    await save({
      ...db,
      vendors: db.vendors.map((v) => (v.id === vendor.id ? updated : v)),
    });
  }

  const mapped = hasCoords(vendor);

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/vendors" className="hover:text-gray-900">
          Vendors
        </Link>
        <span>›</span>
        <span className="text-gray-900">{vendor.name}</span>
      </div>

      <div className="mb-8 flex items-start gap-4">
        <Link
          href="/vendors"
          className="mt-1 text-gray-400 hover:text-gray-600"
          aria-label="Back to vendors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100">
          <Store className="h-7 w-7 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">{vendor.name}</h1>
            {vendor.temporary && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Temp site
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 capitalize">{vendor.type}</p>
          {vendor.address ? (
            <p className="mt-2 text-sm text-gray-600">{vendor.address}</p>
          ) : (
            <p className="mt-2 text-sm italic text-gray-300">No address</p>
          )}
          <div className="mt-2">
            {mapped ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
                <MapPin className="h-3.5 w-3.5" />
                On vendor map
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-xs text-amber-600">
                <TriangleAlert className="h-3.5 w-3.5" />
                Not on map
                {vendor.address && (
                  <button
                    type="button"
                    onClick={() => regeocode()}
                    className="text-[#0f6b4f] underline hover:no-underline"
                  >
                    Retry geocode
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 shrink-0"
          onClick={() => setVendorEditOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit vendor
        </Button>
      </div>

      <VendorFormSheet
        open={vendorEditOpen}
        onOpenChange={setVendorEditOpen}
        vendor={vendor}
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <Package className="h-5 w-5 text-gray-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Materials</h2>
            <p className="text-sm text-gray-500">
              {materials.length} material{materials.length !== 1 ? "s" : ""} with pricing
            </p>
          </div>
        </div>
        <Button
          className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" /> Add Material
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Price</th>
              <th className="px-4 py-3 text-left font-medium">Unit</th>
              <th className="px-4 py-3 text-left font-medium">Photos</th>
            </tr>
          </thead>
          <tbody>
            {materials.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No materials for this vendor yet. Add one above.
                </td>
              </tr>
            )}
            {materials.map((m) => {
              const editVal = editingPrices[m.id] ?? String(m.pricePerTon);
              const unit = normalizeMaterialUnit(m.priceUnit);
              return (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Input
                      className="h-8 min-w-[120px] font-medium"
                      value={editingNames[m.id] ?? m.name}
                      onChange={(e) =>
                        setEditingNames((prev) => ({ ...prev, [m.id]: e.target.value }))
                      }
                      onBlur={() => {
                        const next = (editingNames[m.id] ?? m.name).trim();
                        if (next && next !== m.name) updateMaterial(m.id, { name: next });
                        setEditingNames((prev) => {
                          const copy = { ...prev };
                          delete copy[m.id];
                          return copy;
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      className="h-8 min-w-[100px]"
                      placeholder="—"
                      value={editingTypes[m.id] ?? m.type ?? ""}
                      onChange={(e) =>
                        setEditingTypes((prev) => ({ ...prev, [m.id]: e.target.value }))
                      }
                      onBlur={() => {
                        const next = (editingTypes[m.id] ?? m.type ?? "").trim();
                        if (next !== (m.type ?? "")) updateMaterial(m.id, { type: next });
                        setEditingTypes((prev) => {
                          const copy = { ...prev };
                          delete copy[m.id];
                          return copy;
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 max-w-[140px]">
                      <span className="text-gray-400 text-sm">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-8"
                        value={editVal}
                        onChange={(e) =>
                          setEditingPrices((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          const next = parseFloat(editVal);
                          if (!isNaN(next) && next !== m.pricePerTon) {
                            updateMaterial(m.id, { pricePerTon: next });
                          }
                          setEditingPrices((prev) => {
                            const copy = { ...prev };
                            delete copy[m.id];
                            return copy;
                          });
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="h-8 min-w-[180px] rounded-md border border-gray-200 px-2 text-sm"
                      value={unit}
                      onChange={(e) =>
                        updateMaterial(m.id, {
                          priceUnit: e.target.value as MaterialPriceUnit,
                        })
                      }
                    >
                      {MATERIAL_PRICE_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {(m.photos ?? []).map((src, i) => (
                        <div key={i} className="group relative h-12 w-12 overflow-hidden rounded-md border border-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhotoFromMaterial(m.id, i)}
                            className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100"
                            aria-label="Remove photo"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-400 hover:border-[#0f6b4f] hover:text-[#0f6b4f]">
                        <Camera className="h-5 w-5" />
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            addPhotosToMaterial(m.id, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setForm({ name: "", type: "", pricePerTon: "", priceUnit: DEFAULT_MATERIAL_PRICE_UNIT, photos: [] });
        }}
      >
        <SheetContent className="w-full max-w-[420px]">
          <SheetHeader>
            <SheetTitle>Add Material</SheetTitle>
            <p className="text-sm text-gray-500">For {vendor.name}</p>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. #57 Stone"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <Input
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                placeholder="e.g. 57-stone"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Unit</label>
              <select
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
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
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Price ($)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.pricePerTon}
                onChange={(e) => setForm({ ...form, pricePerTon: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Photos</label>
              <div className="flex flex-wrap items-center gap-2">
                {form.photos.map((src, i) => (
                  <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-md border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))}
                      className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-400 hover:border-[#0f6b4f] hover:text-[#0f6b4f]">
                  <Camera className="h-5 w-5" />
                  <span className="mt-0.5 text-[10px]">Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addPhotosToForm(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex gap-3 border-t bg-white p-4">
            <Button
              className="flex-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white"
              onClick={createMaterial}
              disabled={!form.name.trim()}
            >
              Add Material
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
