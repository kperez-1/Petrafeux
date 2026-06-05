"use client";

import { useState } from "react";
import Link from "next/link";
import { isRemote } from "@/lib/storage";
import { useRouter } from "next/navigation";
import { Store, Search, Plus, TriangleAlert, MapPin, Loader2 } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { Vendor } from "@/lib/types";
import { geocodeAddress } from "@/lib/quote-calc";
import { geocodeVendorsMissingCoords, vendorHasCoords } from "@/lib/geocode-vendors";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VendorFormSheet } from "@/components/VendorFormSheet";
import {
  PageHeader,
  PageActionCards,
  PageActionCard,
  PageToolbar,
} from "@/components/layout";

/** A vendor has valid map coords if lat+lng are both finite numbers */
function hasCoords(v: Vendor): boolean {
  return typeof v.lat === "number" && isFinite(v.lat) &&
         typeof v.lng === "number" && isFinite(v.lng);
}

export default function VendorsPage() {
  const router = useRouter();
  const { db, save } = useDb();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [tempOnly, setTempOnly] = useState(false);
  const [batchGeocoding, setBatchGeocoding] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [regeocodeError, setRegeocodeError] = useState<string | null>(null);
  const [regeocodingId, setRegeocodingId] = useState<string | null>(null);

  const filtered = db.vendors.filter(
    (v) =>
      (!tempOnly || v.temporary) &&
      (v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.address.toLowerCase().includes(search.toLowerCase()))
  );

  const missingCoordsCount = db.vendors.filter((v) => !hasCoords(v)).length;
  const quarryCount = db.vendors.filter((v) => v.type === "quarry").length;
  const showQuarryImportHint = !isRemote() && quarryCount < 10;

  /** Re-geocode a vendor that's missing coords */
  async function regeocode(vendor: Vendor) {
    if (!vendor.address.trim()) return;
    setRegeocodeError(null);
    setRegeocodingId(vendor.id);
    const coords = await geocodeAddress(vendor.address.trim());
    setRegeocodingId(null);
    if (!coords) {
      setRegeocodeError(
        "Geocode failed (often rate-limited). Wait a few seconds, or use “Geocode all for map” below."
      );
      return;
    }
    const updated: Vendor = {
      ...vendor,
      lat: coords.lat,
      lng: coords.lng,
      mapCoordsApproximate: coords.approximate === true,
    };
    await save({
      ...db,
      vendors: db.vendors.map((v) => (v.id === vendor.id ? updated : v)),
    });
  }

  async function geocodeAllForMap() {
    const missing = db.vendors.filter((v) => v.address?.trim() && !vendorHasCoords(v)).length;
    if (missing === 0) return;
    setBatchGeocoding(true);
    setBatchProgress(`0 / ${missing}…`);
    const result = await geocodeVendorsMissingCoords(db.vendors, (done, total, name) => {
      setBatchProgress(`${done} / ${total} — ${name}`);
    });
    await save({ ...db, vendors: result.vendors });
    setBatchProgress(`Done: ${result.geocoded} mapped, ${result.failed} failed (wait 1s between lookups).`);
    setBatchGeocoding(false);
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={Store}
        title="Vendors"
        description="Quarries and disposal sites"
      />

      <PageActionCards>
        <PageActionCard
          icon={Plus}
          title="New Vendor"
          description="Add a quarry or disposal site with a pickup address."
          buttonLabel="New Vendor"
          onClick={() => setOpen(true)}
        />
        <PageActionCard
          icon={MapPin}
          title="Vendor map"
          description="View vendors on the map and build quote routes."
          buttonLabel="Open map"
          variant="outline"
          onClick={() => router.push("/vendor-map")}
        />
      </PageActionCards>

      {showQuarryImportHint && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <Store className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="text-sm text-blue-900">
            ATPB quarries are stored in the server import file, not in this browser yet ({quarryCount}{" "}
            loaded). Go to{" "}
            <Link href="/settings" className="font-medium underline">
              Settings
            </Link>{" "}
            and click <strong>Load ATPB quarries from import</strong>, then refresh this page.
          </p>
        </div>
      )}

      {/* Warning banner when vendors are missing map coordinates */}
      {missingCoordsCount > 0 && (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-amber-800">
              <span className="font-medium">{missingCoordsCount} vendor{missingCoordsCount !== 1 ? "s" : ""} won&apos;t appear on the map</span>
              {" "}— run geocoding once (~1 second per vendor). Uses OpenStreetMap, then US Census, then city-level fallback for rural sites.
            </p>
            {batchProgress && <p className="mt-1 text-xs text-amber-700">{batchProgress}</p>}
            {regeocodeError && <p className="mt-1 text-xs text-red-700">{regeocodeError}</p>}
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0 bg-[#0f6b4f] text-white hover:bg-[#0d5c43]"
            disabled={batchGeocoding}
            onClick={geocodeAllForMap}
          >
            {batchGeocoding ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Geocoding…
              </>
            ) : (
              "Geocode all for map"
            )}
          </Button>
        </div>
      )}

      <PageToolbar>
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="h-10 pl-9"
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={tempOnly}
            onChange={(e) => setTempOnly(e.target.checked)}
            className="h-4 w-4 accent-[#0f6b4f]"
          />
          Temp sites only
        </label>
      </PageToolbar>

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
              const materialCount = db.materials.filter((m) => m.vendorId === v.id).length;
              return (
                <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/vendors/${v.id}`}
                        className="font-medium text-gray-900 hover:text-[#0f6b4f]"
                      >
                        {v.name}
                      </Link>
                      {v.temporary && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          Temp
                        </span>
                      )}
                    </span>
                    {materialCount > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {materialCount} material{materialCount !== 1 ? "s" : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3"><span className="capitalize text-gray-500">{v.type}</span></td>
                  <td className="px-4 py-3 text-gray-500">{v.address || <span className="italic text-gray-300">No address</span>}</td>
                  <td className="px-4 py-3">
                    {mapped ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-700">
                        <MapPin className="h-3.5 w-3.5" />
                        {v.mapCoordsApproximate ? "On map (approx)" : "On map"}
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
                            disabled={regeocodingId === v.id}
                            className="text-xs text-[#0f6b4f] underline hover:no-underline disabled:opacity-50"
                          >
                            {regeocodingId === v.id ? "Locating…" : "Retry"}
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

      <VendorFormSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
