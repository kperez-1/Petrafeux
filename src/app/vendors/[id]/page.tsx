"use client";

import { use, useState, useMemo } from "react";
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
  FileText,
  Trash2,
  Upload,
} from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatDate, generateId, todayDateInputValue } from "@/lib/utils";
import { filesToResizedDataUrls } from "@/lib/image-utils";
import {
  Material,
  Vendor,
  VendorDocument,
  VendorDocumentLabel,
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
import { PartyBalanceCard } from "@/components/billing/PartyBalanceCard";
import { apBalanceSummary, apRowsForVendor } from "@/lib/billing-ledger";
import { Pencil } from "lucide-react";

const MAX_DOC_BYTES = 2.5 * 1024 * 1024;

const DOC_LABELS: { value: VendorDocumentLabel; label: string }[] = [
  { value: "contract", label: "Contract" },
  { value: "rate_confirmation", label: "Rate confirmation" },
  { value: "other", label: "Other" },
];

function hasCoords(v: Vendor): boolean {
  return (
    typeof v.lat === "number" &&
    isFinite(v.lat) &&
    typeof v.lng === "number" &&
    isFinite(v.lng)
  );
}

function isExpired(date?: string): boolean {
  if (!date) return false;
  return date < todayDateInputValue();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
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
    rateExpiresOn: "",
    photos: [] as string[],
  });
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [editingTypes, setEditingTypes] = useState<Record<string, string>>({});
  const [vendorEditOpen, setVendorEditOpen] = useState(false);
  const [bulkExpiresOn, setBulkExpiresOn] = useState("");
  const [docLabel, setDocLabel] = useState<VendorDocumentLabel>("rate_confirmation");
  const [docError, setDocError] = useState<string | null>(null);

  const vendor = db.vendors.find((v) => v.id === id);
  const materials = db.materials.filter((m) => m.vendorId === id);
  const vendorApRows = useMemo(
    () => (vendor ? apRowsForVendor(db, vendor.id) : []),
    [db, vendor]
  );
  const apSummary = useMemo(() => apBalanceSummary(vendorApRows), [vendorApRows]);

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
      rateExpiresOn: form.rateExpiresOn || undefined,
      photos: form.photos.length ? form.photos : undefined,
    };
    await save({ ...db, materials: [m, ...db.materials] });
    setForm({
      name: "",
      type: "",
      pricePerTon: "",
      priceUnit: DEFAULT_MATERIAL_PRICE_UNIT,
      rateExpiresOn: "",
      photos: [],
    });
    setOpen(false);
  }

  async function updateMaterial(
    materialId: string,
    patch: Partial<
      Pick<Material, "pricePerTon" | "priceUnit" | "name" | "type" | "photos" | "rateExpiresOn">
    >
  ) {
    await save({
      ...db,
      materials: db.materials.map((m) =>
        m.id === materialId ? { ...m, ...patch } : m
      ),
    });
  }

  async function applyExpiresToAll() {
    if (!bulkExpiresOn || !vendor) return;
    await save({
      ...db,
      materials: db.materials.map((m) =>
        m.vendorId === vendor.id ? { ...m, rateExpiresOn: bulkExpiresOn } : m
      ),
    });
  }

  async function uploadVendorDocument(files: FileList | null) {
    if (!files?.length || !vendor) return;
    setDocError(null);
    const nextDocs: VendorDocument[] = [...(vendor.documents ?? [])];
    for (const file of Array.from(files)) {
      if (file.size > MAX_DOC_BYTES) {
        setDocError(`"${file.name}" is too large (max ~2.5 MB).`);
        continue;
      }
      const dataUrl = await readFileAsDataUrl(file);
      nextDocs.unshift({
        id: generateId(),
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        uploadedAt: new Date().toISOString(),
        label: docLabel,
        dataUrl,
      });
    }
    await save({
      ...db,
      vendors: db.vendors.map((v) =>
        v.id === vendor.id ? { ...v, documents: nextDocs } : v
      ),
    });
  }

  async function removeVendorDocument(docId: string) {
    if (!vendor) return;
    const nextDocs = (vendor.documents ?? []).filter((d) => d.id !== docId);
    await save({
      ...db,
      vendors: db.vendors.map((v) =>
        v.id === vendor.id
          ? { ...v, documents: nextDocs.length ? nextDocs : undefined }
          : v
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

      <div className="mb-8 max-w-md">
        <PartyBalanceCard
          title="Accounts Payable"
          owedLabel="We owe"
          paidLabel="Paid"
          openTotal={apSummary.openTotal}
          openCount={apSummary.openCount}
          paidTotal={apSummary.paidTotal}
          paidCount={apSummary.paidCount}
          viewHref={`/billing/ap?bucket=open&tab=vendors&vendorId=${vendor.id}`}
          viewAllHref={`/billing/ap?bucket=all&tab=vendors&vendorId=${vendor.id}`}
          emptyHint="No payables yet — vendor bills are created when material or disposal tickets are approved."
        />
      </div>

      {(vendor.contactName ||
        vendor.contactEmail ||
        vendor.contactPhone ||
        vendor.paymentTermsDays != null ||
        vendor.taxId ||
        vendor.w9OnFile) && (
        <div className="mb-8 max-w-md rounded-xl border border-gray-200 bg-white p-5 text-sm">
          <h2 className="mb-3 font-semibold text-gray-900">AP profile</h2>
          <dl className="space-y-2 text-gray-600">
            {vendor.contactName && (
              <div className="flex justify-between gap-2">
                <dt>Contact</dt>
                <dd className="text-right font-medium text-gray-900">{vendor.contactName}</dd>
              </div>
            )}
            {vendor.contactEmail && (
              <div className="flex justify-between gap-2">
                <dt>Email</dt>
                <dd className="text-right">{vendor.contactEmail}</dd>
              </div>
            )}
            {vendor.contactPhone && (
              <div className="flex justify-between gap-2">
                <dt>Phone</dt>
                <dd className="text-right">{vendor.contactPhone}</dd>
              </div>
            )}
            {vendor.paymentTermsDays != null && (
              <div className="flex justify-between gap-2">
                <dt>Payment terms</dt>
                <dd className="text-right">Net {vendor.paymentTermsDays}</dd>
              </div>
            )}
            {vendor.taxId && (
              <div className="flex justify-between gap-2">
                <dt>Tax ID (EIN)</dt>
                <dd className="text-right font-mono text-xs">{vendor.taxId}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt>W-9 on file</dt>
              <dd className="text-right">{vendor.w9OnFile ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-500" />
            <div>
              <h2 className="font-semibold text-gray-900">Contracts &amp; rate confirmations</h2>
              <p className="text-sm text-gray-500">
                Store vendor contracts and emailed rate sheets. Auto-apply rates coming later.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
              value={docLabel}
              onChange={(e) => setDocLabel(e.target.value as VendorDocumentLabel)}
            >
              {DOC_LABELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Upload className="h-3.5 w-3.5" />
              Upload
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.msg,.eml,image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  void uploadVendorDocument(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        {docError && <p className="mb-2 text-sm text-red-600">{docError}</p>}
        {(vendor.documents ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No documents uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(vendor.documents ?? []).map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <a
                    href={doc.dataUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[#0f6b4f] hover:underline"
                  >
                    {doc.fileName}
                  </a>
                  <p className="text-xs text-gray-400">
                    {DOC_LABELS.find((l) => l.value === doc.label)?.label ?? "Document"} ·{" "}
                    {formatDate(doc.uploadedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeVendorDocument(doc.id)}
                  className="shrink-0 text-gray-300 hover:text-red-500"
                  aria-label="Remove document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-400">Apply rates from document — coming soon</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
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
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Expires (all materials)</label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="h-9 w-[150px]"
                value={bulkExpiresOn}
                onChange={(e) => setBulkExpiresOn(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                disabled={!bulkExpiresOn || materials.length === 0}
                onClick={() => void applyExpiresToAll()}
              >
                Apply to all
              </Button>
            </div>
          </div>
          <Button
            className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-4 w-4" /> Add Material
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Price</th>
              <th className="px-4 py-3 text-left font-medium">Unit</th>
              <th className="px-4 py-3 text-left font-medium">Expires</th>
              <th className="px-4 py-3 text-left font-medium">Photos</th>
            </tr>
          </thead>
          <tbody>
                {materials.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
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
                    <div className="space-y-0.5">
                      <Input
                        type="date"
                        className={`h-8 w-[140px] ${
                          isExpired(m.rateExpiresOn) ? "border-amber-400 text-amber-800" : ""
                        }`}
                        value={m.rateExpiresOn ?? ""}
                        onChange={(e) =>
                          updateMaterial(m.id, {
                            rateExpiresOn: e.target.value || undefined,
                          })
                        }
                      />
                      {isExpired(m.rateExpiresOn) && (
                        <p className="text-[10px] font-medium text-amber-700">Expired</p>
                      )}
                    </div>
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
          if (!o)
            setForm({
              name: "",
              type: "",
              pricePerTon: "",
              priceUnit: DEFAULT_MATERIAL_PRICE_UNIT,
              rateExpiresOn: "",
              photos: [],
            });
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
              <label className="text-sm font-medium text-gray-700">Rate expires</label>
              <Input
                type="date"
                value={form.rateExpiresOn}
                onChange={(e) => setForm({ ...form, rateExpiresOn: e.target.value })}
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
