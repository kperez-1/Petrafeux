"use client";

import { useState } from "react";
import { Store, Search, Plus, TriangleAlert, MapPin, Loader2 } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { generateId } from "@/lib/utils";
import { Vendor } from "@/lib/types";
import { geocodeAddress } from "@/lib/quote-calc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const EMPTY: Omit<Vendor, "id"> = { name: "", address: "", type: "quarry" };

/** A vendor has valid map coords if lat+lng are both finite numbers */
function hasCoords(v: Vendor): boolean {
  return typeof v.lat === "number" && isFinite(v.lat) &&
         typeof v.lng === "number" && isFinite(v.lng);
}

export default function VendorsPage() {
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<"idle" | "ok" | "failed">("idle");

  const filtered = db.vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.address.toLowerCase().includes(search.toLowerCase())
  );

  const missingCoordsCount = db.vendors.filter((v) => !hasCoords(v)).length;

  async function create() {
    if (!form.name.trim()) return;
    setGeocoding(true);
    setGeocodeStatus("idle");

    let lat: number | undefined;
    let lng: number | undefined;

    if (form.address.trim()) {
      const coords = await geocodeAddress(form.address.trim());
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        setGeocodeStatus("ok");
      } else {
        setGeocodeStatus("failed");
      }
    }

    const v: Vendor = { id: generateId(), ...form, lat, lng };
    await save({ ...db, vendors: [v, ...db.vendors] });
    setGeocoding(false);
    setForm(EMPTY);
    setGeocodeStatus("idle");
    setOpen(false);
  }

  /** Re-geocode a vendor that's missing coords */
  async function regeocode(vendor: Vendor) {
    if (!vendor.address.trim()) return;
    const coords = await geocodeAddress(vendor.address.trim());
    const updated: Vendor = {
      ...vendor,
      lat: coords?.lat,
      lng: coords?.lng,
    };
    await save({
      ...db,
      vendors: db.vendors.map((v) => (v.id === vendor.id ? updated : v)),
    });
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <Store className="h-6 w-6 text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
            <p className="text-sm text-gray-500">Quarries and disposal sites</p>
          </div>
        </div>
        <Button className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Vendor
        </Button>
      </div>

      {/* Warning banner when vendors are missing map coordinates */}
      {missingCoordsCount > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800">
            <span className="font-medium">{missingCoordsCount} vendor{missingCoordsCount !== 1 ? "s" : ""} won&apos;t appear on the map</span>
            {" "}— their address couldn&apos;t be located. Check the address and use the retry button to fix it.
          </p>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input className="pl-9" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Address</th>
              <th className="px-4 py-3 text-left font-medium">Map</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No vendors yet.</td></tr>
            )}
            {filtered.map((v) => {
              const mapped = hasCoords(v);
              return (
                <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                  <td className="px-4 py-3"><span className="capitalize text-gray-500">{v.type}</span></td>
                  <td className="px-4 py-3 text-gray-500">{v.address || <span className="italic text-gray-300">No address</span>}</td>
                  <td className="px-4 py-3">
                    {mapped ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-700">
                        <MapPin className="h-3.5 w-3.5" />
                        On map
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          title="Address not found — this vendor won't appear on the map. Check the address and retry."
                          className="flex items-center gap-1.5 text-xs text-amber-600"
                        >
                          <TriangleAlert className="h-3.5 w-3.5" />
                          Not on map
                        </span>
                        {v.address && (
                          <button
                            onClick={() => regeocode(v)}
                            className="text-xs text-[#0f6b4f] underline hover:no-underline"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New Vendor drawer */}
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setGeocodeStatus("idle"); }}>
        <SheetContent className="w-[420px]">
          <SheetHeader><SheetTitle>New Vendor</SheetTitle></SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vendor name" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "quarry" | "disposal" })}
              >
                <option value="quarry">Quarry</option>
                <option value="disposal">Disposal</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <Input
                value={form.address}
                onChange={(e) => { setForm({ ...form, address: e.target.value }); setGeocodeStatus("idle"); }}
                placeholder="e.g. 1234 Quarry Rd, Fort Pierce, FL 34945"
              />
              <p className="text-xs text-gray-400">
                Full street address or coordinates (lat, lng) — used to place the pin on the vendor map.
              </p>
              {geocodeStatus === "failed" && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Address couldn&apos;t be located — vendor saved but won&apos;t appear on the map. You can edit the address later.
                </p>
              )}
              {geocodeStatus === "ok" && (
                <p className="flex items-center gap-1.5 text-xs text-green-700">
                  <MapPin className="h-3.5 w-3.5" />
                  Address found — vendor will appear on the map.
                </p>
              )}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex gap-3 border-t bg-white p-4">
            <Button
              className="flex-1 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-2"
              onClick={create}
              disabled={!form.name.trim() || geocoding}
            >
              {geocoding && <Loader2 className="h-4 w-4 animate-spin" />}
              {geocoding ? "Locating address…" : "Create Vendor"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
