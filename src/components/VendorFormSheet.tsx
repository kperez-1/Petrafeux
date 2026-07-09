"use client";

import { useEffect, useState } from "react";
import { Camera, Loader2, MapPin, X } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { CreateFormSheet, FormField, FormSection } from "@/components/layout";
import { Input } from "@/components/ui/input";
import {
  Material,
  Vendor,
  MaterialPriceUnit,
  MATERIAL_PRICE_UNITS,
  DEFAULT_MATERIAL_PRICE_UNIT,
} from "@/lib/types";
import { geocodeAddress } from "@/lib/quote-calc";
import { generateId } from "@/lib/utils";
import { filesToResizedDataUrls } from "@/lib/image-utils";

const EMPTY = {
  name: "",
  address: "",
  type: "quarry" as Vendor["type"],
  temporary: false,
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  paymentTermsDays: "30",
  taxId: "",
  w9OnFile: false,
  w9FileUrl: "",
};

const EMPTY_MATERIAL = {
  name: "",
  type: "",
  price: "",
  unit: DEFAULT_MATERIAL_PRICE_UNIT as MaterialPriceUnit,
  photos: [] as string[],
};

export function VendorFormSheet({
  open,
  onOpenChange,
  vendor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor;
  onSaved?: (vendor: Vendor) => void;
}) {
  const { db, save } = useDb();
  const [form, setForm] = useState(EMPTY);
  const [material, setMaterial] = useState(EMPTY_MATERIAL);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(vendor);

  useEffect(() => {
    if (!open) return;
    setGeoCoords(null);
    setMaterial(EMPTY_MATERIAL);
    if (vendor) {
      setForm({
        name: vendor.name,
        address: vendor.address,
        type: vendor.type,
        temporary: vendor.temporary ?? false,
        contactName: vendor.contactName ?? "",
        contactEmail: vendor.contactEmail ?? "",
        contactPhone: vendor.contactPhone ?? "",
        paymentTermsDays: String(vendor.paymentTermsDays ?? 30),
        taxId: vendor.taxId ?? "",
        w9OnFile: vendor.w9OnFile ?? false,
        w9FileUrl: vendor.w9FileUrl ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, vendor]);

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function addMaterialPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const urls = await filesToResizedDataUrls(files);
    if (urls.length === 0) return;
    setMaterial((m) => ({ ...m, photos: [...m.photos, ...urls] }));
  }

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      let lat = vendor?.lat;
      let lng = vendor?.lng;
      let mapCoordsApproximate = vendor?.mapCoordsApproximate;

      if (geoCoords) {
        lat = geoCoords.lat;
        lng = geoCoords.lng;
        mapCoordsApproximate = false;
      } else if (form.address.trim() && form.address !== vendor?.address) {
        const coords = await geocodeAddress(form.address.trim());
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
          mapCoordsApproximate = coords.approximate === true;
        }
      }

      const next: Vendor = {
        id: vendor?.id ?? generateId(),
        name: form.name.trim(),
        address: form.address.trim(),
        type: form.type,
        lat,
        lng,
        mapCoordsApproximate,
        temporary: form.temporary || undefined,
        contactName: form.contactName.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        paymentTermsDays: parseInt(form.paymentTermsDays, 10) || 30,
        taxId: form.taxId.trim() || undefined,
        w9OnFile: form.w9OnFile || undefined,
        w9FileUrl: form.w9FileUrl.trim() || undefined,
      };

      const vendors = vendor
        ? db.vendors.map((v) => (v.id === vendor.id ? next : v))
        : [next, ...db.vendors];

      let materials = vendor
        ? db.materials.map((m) =>
            m.vendorId === vendor.id ? { ...m, vendorName: next.name } : m
          )
        : db.materials;

      // When creating, optionally add a first material in the same flow
      if (!vendor && material.name.trim()) {
        const m: Material = {
          id: generateId(),
          vendorId: next.id,
          vendorName: next.name,
          name: material.name.trim(),
          type: material.type.trim(),
          pricePerTon: parseFloat(material.price) || 0,
          priceUnit: material.unit,
          photos: material.photos.length ? material.photos : undefined,
        };
        materials = [m, ...materials];
      }

      await save({ ...db, vendors, materials });
      onSaved?.(next);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <CreateFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit vendor" : "New site / vendor"}
      description={
        isEdit
          ? "Update quarry, disposal, or temporary site details."
          : "Add a quarry, disposal, or temporary material site."
      }
      submitLabel={saving ? "Saving…" : isEdit ? "Save changes" : "Create site"}
      onSubmit={submit}
      disabled={!form.name.trim() || saving}
    >
      <FormSection title="Site" description="Quarry, disposal, or temporary material site">
        <FormField label="Name" required>
          <Input
            className="h-11"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Smith Rd excess dirt"
          />
        </FormField>
        <FormField label="Type">
          <select
            className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as Vendor["type"] })}
          >
            <option value="quarry">Quarry</option>
            <option value="disposal">Disposal</option>
          </select>
        </FormField>
        <FormField label="Address">
          <Input
            className="h-11"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Street, city, state, zip"
          />
        </FormField>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-[#0f6b4f] hover:text-[#0f6b4f] disabled:opacity-60"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {geoCoords ? "Location captured ✓ (tap to redo)" : "Use my current location"}
        </button>
        {geoCoords && (
          <p className="text-xs text-gray-400">
            Pin set to {geoCoords.lat.toFixed(5)}, {geoCoords.lng.toFixed(5)}
          </p>
        )}
        <label className="flex items-center gap-2.5 rounded-md border border-gray-200 px-3 py-2.5">
          <input
            type="checkbox"
            checked={form.temporary}
            onChange={(e) => setForm({ ...form, temporary: e.target.checked })}
            className="h-4 w-4 accent-[#0f6b4f]"
          />
          <span className="text-sm text-gray-700">
            Temporary site
            <span className="block text-xs text-gray-400">
              Short-lived material site (gone in weeks/months)
            </span>
          </span>
        </label>
      </FormSection>

      <FormSection title="AP profile" description="Payment and tax info for accounts payable">
        <FormField label="Contact name">
          <Input
            className="h-11"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          />
        </FormField>
        <FormField label="Contact email">
          <Input
            type="email"
            className="h-11"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
        </FormField>
        <FormField label="Contact phone">
          <Input
            className="h-11"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
        </FormField>
        <FormField label="Payment terms (days)">
          <Input
            type="number"
            min="0"
            className="h-11"
            value={form.paymentTermsDays}
            onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })}
          />
        </FormField>
        <FormField label="Tax ID (EIN)">
          <Input
            className="h-11"
            value={form.taxId}
            onChange={(e) => setForm({ ...form, taxId: e.target.value })}
          />
        </FormField>
        <label className="flex items-center gap-2.5 rounded-md border border-gray-200 px-3 py-2.5">
          <input
            type="checkbox"
            checked={form.w9OnFile}
            onChange={(e) => setForm({ ...form, w9OnFile: e.target.checked })}
            className="h-4 w-4 accent-[#0f6b4f]"
          />
          <span className="text-sm text-gray-700">W-9 on file</span>
        </label>
        <FormField label="W-9 file URL (stub)">
          <Input
            className="h-11"
            value={form.w9FileUrl}
            onChange={(e) => setForm({ ...form, w9FileUrl: e.target.value })}
            placeholder="https://…"
          />
        </FormField>
      </FormSection>

      {!isEdit && (
        <FormSection title="First material (optional)" description="Add a material now — handy on the phone">
          <FormField label="Material name">
            <Input
              className="h-11"
              value={material.name}
              onChange={(e) => setMaterial({ ...material, name: e.target.value })}
              placeholder="e.g. Fill dirt"
            />
          </FormField>
          <FormField label="Type">
            <Input
              className="h-11"
              value={material.type}
              onChange={(e) => setMaterial({ ...material, type: e.target.value })}
              placeholder="e.g. fill"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Price ($)">
              <Input
                type="number"
                step="0.01"
                min="0"
                className="h-11"
                value={material.price}
                onChange={(e) => setMaterial({ ...material, price: e.target.value })}
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Unit">
              <select
                className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                value={material.unit}
                onChange={(e) =>
                  setMaterial({ ...material, unit: e.target.value as MaterialPriceUnit })
                }
              >
                {MATERIAL_PRICE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Photos">
            <div className="flex flex-wrap items-center gap-2">
              {material.photos.map((src, i) => (
                <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-md border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setMaterial((m) => ({ ...m, photos: m.photos.filter((_, j) => j !== i) }))
                    }
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
                    addMaterialPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </FormField>
        </FormSection>
      )}
    </CreateFormSheet>
  );
}
