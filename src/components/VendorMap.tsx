"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, Search, MapPin, Plus, Loader2, Trash2, Truck, FileText } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { Vendor, Material, MaterialPriceUnit, Quote } from "@/lib/types";
import { geocodeVendorsMissingCoords, vendorHasCoords } from "@/lib/geocode-vendors";
import { formatMaterialPrice, formatCurrency, generateId } from "@/lib/utils";
import { normalizeMaterialUnit } from "@/lib/types";
import { geocodeAddress } from "@/lib/quote-calc";
import { lookupHaulRateByMiles, impliedRatePerTon } from "@/lib/haul-pricing";
import { fetchRoadRoute, RoadRoute } from "@/lib/routing";
import {
  applyMapClipboardToRoutes,
  defaultProjectNameFromAddress,
  type JobHaulInfo,
  type MapClipboardItem,
} from "@/lib/map-clipboard";
import { buildNewProject } from "@/lib/projects";
import { generateQuoteNumber } from "@/lib/storage";
import { resolveCurrentUser } from "@/lib/current-user";
import { normalizeRouteMaterials } from "@/lib/route-materials";

export type { JobHaulInfo, MapClipboardItem };

export interface VendorMapJobContext {
  address: string;
  name: string;
}

interface VendorMapProps {
  onClose: () => void;
  /** If provided, the map is opened from a quote — staged clipboard items are applied to the quote */
  onApplyToQuote?: (items: MapClipboardItem[], job: VendorMapJobContext) => void;
  projectAddress?: string;
  /** Human label for the job site, shown on the map pin and clipboard header */
  projectName?: string;
}

export function VendorMap({ onClose, onApplyToQuote, projectAddress, projectName }: VendorMapProps) {
  const { db, save } = useDb();
  const router = useRouter();
  const [jobAddress, setJobAddress] = useState(projectAddress ?? "");
  const [jobName, setJobName] = useState(projectName ?? "");
  const [addressGeocoding, setAddressGeocoding] = useState(false);
  const [startingQuote, setStartingQuote] = useState(false);
  const [batchGeocoding, setBatchGeocoding] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const jobMarkerRef = useRef<unknown>(null);
  const routeLineRef = useRef<unknown>(null);
  const [search, setSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [clipboard, setClipboard] = useState<MapClipboardItem[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [jobCoords, setJobCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<{ vendorId: string; route: RoadRoute } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState<{
    name: string;
    buy: string;
    unit: MaterialPriceUnit;
    saveToVendor: boolean;
  }>({ name: "", buy: "", unit: "TN", saveToVendor: false });

  const filteredVendors = db.vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.address.toLowerCase().includes(search.toLowerCase())
  );

  const missingMapCoords = db.vendors.filter((v) => v.address?.trim() && !vendorHasCoords(v)).length;

  async function geocodeAllForMap() {
    if (missingMapCoords === 0) return;
    setBatchGeocoding(true);
    setBatchProgress(`0 / ${missingMapCoords}…`);
    const result = await geocodeVendorsMissingCoords(db.vendors, (done, total, name) => {
      setBatchProgress(`${done} / ${total} — ${name}`);
    });
    await save({ ...db, vendors: result.vendors });
    setBatchProgress(`Done: ${result.geocoded} on map, ${result.failed} failed.`);
    setBatchGeocoding(false);
  }

  useEffect(() => {
    setJobAddress(projectAddress ?? "");
  }, [projectAddress]);

  useEffect(() => {
    setJobName(projectName ?? "");
  }, [projectName]);

  // Geocode the job/project address (drives the job pin + haul estimates)
  useEffect(() => {
    let cancelled = false;
    const trimmed = jobAddress.trim();
    if (!trimmed) {
      setJobCoords(null);
      setAddressGeocoding(false);
      return;
    }
    setAddressGeocoding(true);
    geocodeAddress(trimmed).then((coords) => {
      if (!cancelled) {
        setJobCoords(coords ? { lat: coords.lat, lng: coords.lng } : null);
        setAddressGeocoding(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [jobAddress]);

  // Per-mile haul rate for a given driving distance (pickup → job)
  const haulFromRoute = useMemo(() => {
    return (route: RoadRoute): JobHaulInfo => {
      const row = lookupHaulRateByMiles(route.miles, db.haulRates);
      return {
        miles: route.miles,
        ratePerLoad: row ? row.ratePerLoad : null,
        ratePerTon: row ? impliedRatePerTon(row.ratePerLoad) : null,
        approximate: route.approximate,
      };
    };
  }, [db.haulRates]);

  // Fetch the driving route whenever the selected vendor or job location changes
  useEffect(() => {
    let cancelled = false;
    setSelectedRoute(null);
    if (
      !jobCoords ||
      !selectedVendor ||
      typeof selectedVendor.lat !== "number" ||
      typeof selectedVendor.lng !== "number"
    ) {
      setRouteLoading(false);
      return;
    }
    const vendorId = selectedVendor.id;
    const from = { lat: selectedVendor.lat, lng: selectedVendor.lng };
    setRouteLoading(true);
    fetchRoadRoute(from, jobCoords).then((route) => {
      if (cancelled) return;
      setSelectedRoute({ vendorId, route });
      setRouteLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedVendor, jobCoords]);

  // Reset the ad-hoc material form when the selected vendor changes
  useEffect(() => {
    setShowCustomForm(false);
    setCustomForm({ name: "", buy: "", unit: "TN", saveToVendor: false });
  }, [selectedVendor]);

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

      const withFinite = db.vendors.filter(
        (v) => typeof v.lat === "number" && isFinite(v.lat) && typeof v.lng === "number" && isFinite(v.lng)
      );
      withFinite
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

  // Job-site pin + hauling route line (pickup vendor → job)
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;

    import("leaflet").then((L) => {
      const map = leafletMapRef.current as ReturnType<typeof L.map>;

      // Clear previous job marker + route line
      if (jobMarkerRef.current) {
        (jobMarkerRef.current as ReturnType<typeof L.marker>).remove();
        jobMarkerRef.current = null;
      }
      if (routeLineRef.current) {
        (routeLineRef.current as ReturnType<typeof L.polyline>).remove();
        routeLineRef.current = null;
      }

      if (!jobCoords) return;

      const displayName = jobName.trim() || defaultProjectNameFromAddress(jobAddress);
      const label = displayName
        ? `📍 ${displayName.length > 20 ? displayName.slice(0, 20) + "…" : displayName}`
        : "📍 Job site";
      const jobIcon = L.divIcon({
        className: "",
        html: `<div style="
          background: #0f6b4f;
          border: 2px solid white;
          border-radius: 9999px;
          padding: 4px 11px;
          font-size: 11px;
          font-weight: 600;
          color: white;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        ">${label}</div>`,
        iconAnchor: [0, 0],
      });
      jobMarkerRef.current = L.marker([jobCoords.lat, jobCoords.lng], { icon: jobIcon, zIndexOffset: 1000 }).addTo(map);

      // Route line when we have a computed driving route for the selected vendor
      const routeForSelection =
        selectedVendor && selectedRoute?.vendorId === selectedVendor.id
          ? selectedRoute.route
          : null;

      if (routeForSelection && routeForSelection.geometry.length > 1) {
        const line = L.polyline(routeForSelection.geometry, {
          color: "#0f6b4f",
          weight: 4,
          opacity: 0.85,
          dashArray: routeForSelection.approximate ? "8 6" : undefined,
        }).addTo(map);
        routeLineRef.current = line;
        map.fitBounds((line as ReturnType<typeof L.polyline>).getBounds(), {
          padding: [80, 80],
          maxZoom: 13,
        });
      } else if (
        selectedVendor &&
        typeof selectedVendor.lat === "number" &&
        typeof selectedVendor.lng === "number"
      ) {
        // Vendor selected but route still loading — fit both endpoints
        map.fitBounds(
          [
            [selectedVendor.lat, selectedVendor.lng],
            [jobCoords.lat, jobCoords.lng],
          ],
          { padding: [80, 80], maxZoom: 12 }
        );
      } else {
        map.setView([jobCoords.lat, jobCoords.lng], Math.max(map.getZoom(), 9));
      }
    });
  }, [mapReady, jobCoords, selectedVendor, selectedRoute, jobName, jobAddress]);

  const jobContext = (): VendorMapJobContext => ({
    address: jobAddress.trim(),
    name: jobName.trim() || defaultProjectNameFromAddress(jobAddress),
  });

  async function startProjectAndQuote() {
    const address = jobAddress.trim();
    if (!address || clipboard.length === 0 || startingQuote) return;
    setStartingQuote(true);
    try {
      const currentUser = resolveCurrentUser(db);
      const name = jobName.trim() || defaultProjectNameFromAddress(address);
      const project = buildNewProject({
        name,
        address,
        officeId: currentUser?.officeId ?? db.offices[0]?.id,
        salespersonId: currentUser?.id,
        stage: "proposal_requested",
      });

      const counter = (db.meta?.quoteCounter ?? 0) + 1;
      const quoteId = generateId();
      const { db: workingDb, routes } = applyMapClipboardToRoutes(
        db,
        clipboard,
        address,
        quoteId,
        []
      );

      const newQuote: Quote = {
        id: quoteId,
        projectId: project.id,
        projectName: project.name,
        number: generateQuoteNumber(counter),
        jobName: name,
        status: "unsent",
        taxRate: db.meta.defaultTaxRate ?? 7,
        routes: routes.map(normalizeRouteMaterials),
        createdAt: new Date().toISOString(),
        history: [{ id: generateId(), type: "created", at: new Date().toISOString(), note: "From vendor map" }],
      };

      await save({
        ...workingDb,
        projects: [project, ...workingDb.projects],
        quotes: [newQuote, ...workingDb.quotes],
        meta: { ...workingDb.meta, quoteCounter: counter },
      });
      setClipboard([]);
      router.push(`/quotes/${quoteId}/edit`);
    } finally {
      setStartingQuote(false);
    }
  }

  const standaloneHref = useMemo(() => {
    const params = new URLSearchParams();
    if (jobAddress.trim()) params.set("address", jobAddress.trim());
    if (jobName.trim()) params.set("name", jobName.trim());
    const qs = params.toString();
    return qs ? `/vendor-map?${qs}` : "/vendor-map";
  }, [jobAddress, jobName]);

  function haulSnapshotFor(vendor: Vendor): JobHaulInfo | null {
    return selectedRoute?.vendorId === vendor.id ? haulFromRoute(selectedRoute.route) : null;
  }

  function addMaterialToClipboard(vendor: Vendor, material: Material) {
    const haul = haulSnapshotFor(vendor);
    setClipboard((prev) => {
      const exists = prev.find(
        (c) => c.kind === "material" && c.vendor.id === vendor.id && c.material?.id === material.id
      );
      if (exists) return prev;
      return [...prev, { id: generateId(), vendor, kind: "material", material, qty: 1, haul }];
    });
  }

  function addHaulingOnlyToClipboard(vendor: Vendor) {
    const haul = haulSnapshotFor(vendor);
    setClipboard((prev) => {
      const exists = prev.find((c) => c.kind === "haul" && c.vendor.id === vendor.id);
      if (exists) return prev;
      return [...prev, { id: generateId(), vendor, kind: "haul", qty: 1, haul }];
    });
  }

  function addCustomToClipboard(vendor: Vendor) {
    const name = customForm.name.trim();
    if (!name) return;
    const buy = parseFloat(customForm.buy) || 0;
    const haul = haulSnapshotFor(vendor);
    setClipboard((prev) => [
      ...prev,
      {
        id: generateId(),
        vendor,
        kind: "custom",
        custom: { name, buy, unit: customForm.unit, saveToVendor: customForm.saveToVendor },
        qty: 1,
        haul,
      },
    ]);
    setCustomForm({ name: "", buy: "", unit: "TN", saveToVendor: false });
    setShowCustomForm(false);
  }

  const vendorMaterials = selectedVendor
    ? db.materials.filter((m) => m.vendorId === selectedVendor.id)
    : [];

  const selectedJobInfo =
    selectedVendor && selectedRoute?.vendorId === selectedVendor.id
      ? haulFromRoute(selectedRoute.route)
      : null;

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
              type="button"
              className="flex shrink-0 items-center gap-2 rounded-md bg-[#0f6b4f] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0d5c43]"
            >
              <MapPin className="h-4 w-4" />
              Vendor Map
            </button>
            <a
              href={standaloneHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </a>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0f6b4f]" />
                <input
                  value={jobAddress}
                  onChange={(e) => setJobAddress(e.target.value)}
                  placeholder="Enter job site address…"
                  className="w-full rounded-lg border-2 border-[#0f6b4f]/40 bg-[#f0f4f2] py-2 pl-9 pr-9 text-sm font-medium placeholder:font-normal placeholder:text-gray-400 focus:border-[#0f6b4f] focus:bg-white focus:outline-none"
                />
                {addressGeocoding && (
                  <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#0f6b4f]" />
                )}
                {jobCoords && !addressGeocoding && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[#0f6b4f]">✓</span>
                )}
              </div>
              <input
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="Project name (optional)"
                className="w-48 shrink-0 rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#0f6b4f] focus:bg-white focus:outline-none"
              />
            </div>
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
              <div className="space-y-2 p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-[#0f6b4f] focus:outline-none"
                    placeholder="Search vendors or materials..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {missingMapCoords > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                    <p className="text-xs text-amber-800">
                      {missingMapCoords} vendor{missingMapCoords !== 1 ? "s" : ""} have no map pin yet. Geocode runs ~1s each (don&apos;t spam Retry).
                    </p>
                    {batchProgress && <p className="mt-1 text-[10px] text-amber-700">{batchProgress}</p>}
                    <button
                      type="button"
                      disabled={batchGeocoding}
                      onClick={geocodeAllForMap}
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-[#0f6b4f] px-2 py-1.5 text-xs font-medium text-white hover:bg-[#0d5c43] disabled:opacity-60"
                    >
                      {batchGeocoding ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Geocoding…
                        </>
                      ) : (
                        "Geocode all for map"
                      )}
                    </button>
                  </div>
                )}
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
                  <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{selectedVendor.name}</p>
                      <p className="text-xs text-gray-400">{selectedVendor.address}</p>
                      {jobAddress.trim() && (
                        <div className="mt-2 rounded-lg bg-[#f0f4f2] px-2.5 py-1.5">
                          {routeLoading ? (
                            <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Calculating road route…
                            </p>
                          ) : selectedJobInfo ? (
                            <>
                              <p className="flex items-center gap-1 text-xs font-medium text-[#0f6b4f]">
                                <Truck className="h-3.5 w-3.5" />
                                {selectedJobInfo.miles.toFixed(1)} mi to job site
                                {selectedJobInfo.approximate && (
                                  <span className="font-normal text-gray-400">(straight-line)</span>
                                )}
                              </p>
                              <p className="mt-0.5 text-[11px] text-gray-600">
                                {selectedJobInfo.ratePerLoad != null
                                  ? `${formatCurrency(selectedJobInfo.ratePerLoad)}/load${
                                      selectedJobInfo.ratePerTon != null
                                        ? ` · ≈ ${formatCurrency(selectedJobInfo.ratePerTon)}/ton`
                                        : ""
                                    }`
                                  : "No matching haul rate"}
                              </p>
                            </>
                          ) : !jobCoords ? (
                            <p className="text-[11px] text-gray-500">Couldn&apos;t locate the job address.</p>
                          ) : (
                            <p className="text-[11px] text-gray-500">Vendor has no map pin — add an address to estimate the haul.</p>
                          )}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setSelectedVendor(null)} className="shrink-0 text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="max-h-72 space-y-3 overflow-y-auto p-4">
                    {/* Hauling only */}
                    <button
                      onClick={() => addHaulingOnlyToClipboard(selectedVendor)}
                      disabled={!selectedJobInfo || selectedJobInfo.ratePerLoad == null}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#0f6b4f]/30 bg-[#f0f4f2] px-3 py-2 text-left hover:bg-[#e6efea] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[#0f6b4f]">
                        <Truck className="h-3.5 w-3.5" />
                        Hauling only
                      </span>
                      <span className="text-xs text-gray-500">
                        {selectedJobInfo?.ratePerLoad != null
                          ? `${formatCurrency(selectedJobInfo.ratePerLoad)}/load`
                          : jobAddress.trim()
                            ? "No rate"
                            : "Enter job address above"}
                      </span>
                    </button>

                    {/* Catalog materials */}
                    {vendorMaterials.length === 0 ? (
                      <p className="text-xs text-gray-400">
                        No materials listed for this vendor. Add a hauling-only line above, or a custom material below.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {vendorMaterials.map((m) => (
                          <div key={m.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{m.name}</p>
                              <p className="text-xs text-gray-400">
                                {formatMaterialPrice(m.pricePerTon, normalizeMaterialUnit(m.priceUnit))}
                              </p>
                            </div>
                            <button
                              onClick={() => addMaterialToClipboard(selectedVendor, m)}
                              className="flex items-center gap-1 rounded-md bg-[#0f6b4f] px-2 py-1 text-xs font-medium text-white hover:bg-[#0d5c43]"
                            >
                              <Plus className="h-3 w-3" />
                              Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Custom (ad-hoc) material */}
                    <div className="border-t border-gray-100 pt-3">
                      {showCustomForm ? (
                        <div className="space-y-2">
                          <input
                            autoFocus
                            value={customForm.name}
                            onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                            placeholder="Material name (e.g. #57 Stone)"
                            className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#0f6b4f] focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={customForm.buy}
                              onChange={(e) => setCustomForm((f) => ({ ...f, buy: e.target.value }))}
                              placeholder="Buy price"
                              className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#0f6b4f] focus:outline-none"
                            />
                            <select
                              value={customForm.unit}
                              onChange={(e) =>
                                setCustomForm((f) => ({ ...f, unit: e.target.value as MaterialPriceUnit }))
                              }
                              className="rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-[#0f6b4f] focus:outline-none"
                            >
                              <option value="TN">Ton</option>
                              <option value="CY">CY</option>
                              <option value="LD">Load</option>
                              <option value="HR">Hour</option>
                            </select>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={customForm.saveToVendor}
                              onChange={(e) =>
                                setCustomForm((f) => ({ ...f, saveToVendor: e.target.checked }))
                              }
                              className="h-3.5 w-3.5 accent-[#0f6b4f]"
                            />
                            Save to {selectedVendor.name}&apos;s catalog
                          </label>
                          <p className="text-[10px] text-gray-400">
                            {customForm.saveToVendor
                              ? "Adds to the shared catalog and links it to this vendor."
                              : "One-time use for this quote only — not saved to the catalog."}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => addCustomToClipboard(selectedVendor)}
                              disabled={!customForm.name.trim()}
                              className="flex-1 rounded-md bg-[#0f6b4f] px-2 py-1.5 text-xs font-medium text-white hover:bg-[#0d5c43] disabled:opacity-50"
                            >
                              Add to clipboard
                            </button>
                            <button
                              onClick={() => {
                                setShowCustomForm(false);
                                setCustomForm({ name: "", buy: "", unit: "TN", saveToVendor: false });
                              }}
                              className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowCustomForm(true)}
                          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 hover:border-[#0f6b4f] hover:text-[#0f6b4f]"
                        >
                          <Plus className="h-3 w-3" />
                          Add custom material
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* No coords notice */}
              {db.vendors.filter((v) => !(typeof v.lat === "number" && isFinite(v.lat) && typeof v.lng === "number" && isFinite(v.lng))).length > 0 && (
                <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-xs text-gray-500 shadow">
                  {db.vendors.filter((v) => !v.lat || !v.lng).length} vendor(s) missing coordinates — edit vendors to add addresses for map pins.
                </div>
              )}
            </div>
          </div>

          {/* Project clipboard */}
          <div className="max-h-56 overflow-y-auto border-t border-gray-200 bg-gray-50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-700">
                Clipboard{jobName.trim() || jobAddress.trim() ? ` · ${jobContext().name}` : ""}{" "}
                <span className="font-normal text-gray-400">({clipboard.length})</span>
              </span>
              <div className="flex items-center gap-3">
                {!jobAddress.trim() && clipboard.length > 0 && (
                  <span className="text-xs text-amber-700">Enter a job address to estimate hauls</span>
                )}
                {clipboard.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setClipboard([])}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear all
                  </button>
                )}
                {onApplyToQuote ? (
                  <button
                    type="button"
                    disabled={clipboard.length === 0 || !jobAddress.trim()}
                    onClick={() => {
                      onApplyToQuote(clipboard, jobContext());
                      setClipboard([]);
                    }}
                    className="rounded-md bg-[#0f6b4f] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0d5c43] disabled:opacity-50"
                  >
                    Apply to Quote ({clipboard.length})
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={clipboard.length === 0 || !jobAddress.trim() || startingQuote}
                    onClick={startProjectAndQuote}
                    className="flex items-center gap-1.5 rounded-md bg-[#0f6b4f] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0d5c43] disabled:opacity-50"
                  >
                    {startingQuote ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Start Project &amp; Quote ({clipboard.length})
                  </button>
                )}
              </div>
            </div>
            {clipboard.length === 0 ? (
              <p className="text-xs text-gray-400">
                Enter the project address above, pick vendors on the map, then add materials or hauling lines.
                {onApplyToQuote
                  ? " Apply to the open quote when ready."
                  : " Start a new project and quote from the clipboard."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {clipboard.map((c, i) => {
                  const info = c.haul;
                  const title =
                    c.kind === "haul"
                      ? "Hauling only"
                      : c.kind === "custom"
                        ? c.custom!.name
                        : c.material!.name;
                  const priceLabel =
                    c.kind === "haul"
                      ? null
                      : c.kind === "custom"
                        ? formatMaterialPrice(c.custom!.buy, c.custom!.unit)
                        : formatMaterialPrice(
                            c.material!.pricePerTon,
                            normalizeMaterialUnit(c.material!.priceUnit)
                          );
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {title}
                          {c.kind === "custom" && (
                            <span className="ml-1 rounded-sm bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">
                              {c.custom!.saveToVendor ? "new" : "one-time"}
                            </span>
                          )}
                          <span className="font-normal text-gray-400"> · {c.vendor.name}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {priceLabel}
                          {info && (
                            <>
                              {priceLabel ? " · " : ""}
                              {info.miles.toFixed(1)} mi
                              {info.ratePerLoad != null && ` · ${formatCurrency(info.ratePerLoad)}/load`}
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => setClipboard((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 text-gray-400 hover:text-gray-700"
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
