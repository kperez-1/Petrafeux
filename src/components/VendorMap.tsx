"use client";

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Search, MapPin, Plus } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { Vendor, Material } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface MapClipboardItem {
  vendor: Vendor;
  material: Material;
  qty: number;
}

interface VendorMapProps {
  onClose: () => void;
  /** If provided, the map is being opened from a quote edit — clicking a material adds it to the quote */
  onAddToQuote?: (vendor: Vendor, material: Material) => void;
  projectAddress?: string;
}

export function VendorMap({ onClose, onAddToQuote, projectAddress }: VendorMapProps) {
  const { db } = useDb();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const [search, setSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [clipboard, setClipboard] = useState<MapClipboardItem[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const filteredVendors = db.vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.address.toLowerCase().includes(search.toLowerCase())
  );

  // Initialise Leaflet map (client-only)
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    import("leaflet").then((L) => {
      // Fix default icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [26.8, -80.1], // South Florida default
        zoom: 8,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (leafletMapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (leafletMapRef.current as any).remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Plot vendor pins whenever vendors or map changes
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;

    import("leaflet").then((L) => {
      const map = leafletMapRef.current as ReturnType<typeof L.map>;

      // Clear old markers
      markersRef.current.forEach((m) => (m as ReturnType<typeof L.marker>).remove());
      markersRef.current = [];

      db.vendors
        .filter((v) => v.lat && v.lng)
        .forEach((v) => {
          const icon = L.divIcon({
            className: "",
            html: `<div style="
              background: white;
              border: 1.5px solid #d1d5db;
              border-radius: 9999px;
              padding: 3px 10px;
              font-size: 11px;
              font-weight: 500;
              color: #111827;
              white-space: nowrap;
              box-shadow: 0 1px 3px rgba(0,0,0,0.12);
              display: flex;
              align-items: center;
              gap: 4px;
              cursor: pointer;
            ">
              ⛏ ${v.name.length > 18 ? v.name.slice(0, 18) + "…" : v.name}
            </div>`,
            iconAnchor: [0, 0],
          });

          const marker = L.marker([v.lat!, v.lng!], { icon })
            .addTo(map)
            .on("click", () => setSelectedVendor(v));

          markersRef.current.push(marker);
        });
    });
  }, [mapReady, db.vendors]);

  function addToClipboard(vendor: Vendor, material: Material) {
    if (onAddToQuote) {
      onAddToQuote(vendor, material);
      return;
    }
    setClipboard((prev) => {
      const exists = prev.find(
        (c) => c.vendor.id === vendor.id && c.material.id === material.id
      );
      if (exists) return prev;
      return [...prev, { vendor, material, qty: 1 }];
    });
  }

  const vendorMaterials = selectedVendor
    ? db.materials.filter((m) => m.vendorId === selectedVendor.id)
    : [];

  return (
    <>
      {/* Leaflet CSS */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />

      <div className="fixed inset-0 z-50 flex">
        {/* Backdrop */}
        <div className="flex-1 bg-black/20" onClick={onClose} />

        {/* Map panel — takes most of the screen */}
        <div className="relative flex w-full max-w-5xl flex-col bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
            <button
              className="flex items-center gap-2 rounded-md bg-[#0f6b4f] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0d5c43]"
            >
              <MapPin className="h-4 w-4" />
              Vendor Map
            </button>
            <a
              href="/vendor-map/standalone"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </a>
            <div className="flex-1" />
            {clipboard.length > 0 && (
              <span className="rounded-full bg-[#0f6b4f] px-2 py-0.5 text-xs font-medium text-white">
                {clipboard.length} selected
              </span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left panel */}
            <div className="flex w-[280px] shrink-0 flex-col border-r border-gray-200 bg-white">
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-[#0f6b4f] focus:outline-none"
                    placeholder="Search vendors or materials..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Vendor list */}
              <div className="flex-1 overflow-y-auto">
                {!search && (
                  <p className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                    All Vendors
                  </p>
                )}
                {filteredVendors.map((v) => {
                  const mats = db.materials.filter((m) => m.vendorId === v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVendor(v)}
                      className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
                        selectedVendor?.id === v.id ? "bg-[#f0f4f2]" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">⛏</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{v.name}</p>
                          <p className="truncate text-xs text-gray-400">{v.address || "No address"}</p>
                        </div>
                      </div>
                      {mats.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {mats.slice(0, 3).map((m) => (
                            <span key={m.id} className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                              {m.name}
                            </span>
                          ))}
                          {mats.length > 3 && (
                            <span className="text-[10px] text-gray-400">+{mats.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
                {filteredVendors.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">No vendors found.</p>
                )}
              </div>
            </div>

            {/* Map area */}
            <div className="relative flex-1">
              <div ref={mapRef} className="h-full w-full" />

              {/* Vendor detail popup */}
              {selectedVendor && (
                <div className="absolute right-4 top-4 z-[1000] w-72 rounded-xl bg-white shadow-xl border border-gray-200">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div>
                      <p className="font-semibold text-gray-900">{selectedVendor.name}</p>
                      <p className="text-xs text-gray-400">{selectedVendor.address}</p>
                    </div>
                    <button onClick={() => setSelectedVendor(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-4">
                    {vendorMaterials.length === 0 ? (
                      <p className="text-sm text-gray-400">No materials listed for this vendor.</p>
                    ) : (
                      <div className="space-y-2">
                        {vendorMaterials.map((m) => (
                          <div key={m.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{m.name}</p>
                              <p className="text-xs text-gray-400">{formatCurrency(m.pricePerTon)}/ton</p>
                            </div>
                            <button
                              onClick={() => addToClipboard(selectedVendor, m)}
                              className="flex items-center gap-1 rounded-md bg-[#0f6b4f] px-2 py-1 text-xs font-medium text-white hover:bg-[#0d5c43]"
                            >
                              <Plus className="h-3 w-3" />
                              {onAddToQuote ? "Add to quote" : "Select"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No coords notice */}
              {db.vendors.filter((v) => !v.lat || !v.lng).length > 0 && (
                <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-xs text-gray-500 shadow">
                  {db.vendors.filter((v) => !v.lat || !v.lng).length} vendor(s) missing coordinates — edit vendors to add addresses for map pins.
                </div>
              )}
            </div>
          </div>

          {/* Clipboard bar (when not in quote-add mode) */}
          {!onAddToQuote && clipboard.length > 0 && (
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Selected ({clipboard.length}):</span>
                <div className="flex flex-1 flex-wrap gap-2">
                  {clipboard.map((c, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2.5 py-0.5 text-xs text-gray-700">
                      {c.vendor.name} · {c.material.name}
                      <button
                        onClick={() => setClipboard((prev) => prev.filter((_, j) => j !== i))}
                        className="ml-1 text-gray-400 hover:text-gray-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <button className="rounded-md bg-[#0f6b4f] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0d5c43]">
                  Apply to Quote
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
