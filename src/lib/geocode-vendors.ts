import { Vendor } from "./types";
import { geocodeAddress } from "./quote-calc";

const DELAY_MS = 1100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function vendorHasCoords(v: Vendor): boolean {
  return (
    typeof v.lat === "number" &&
    isFinite(v.lat) &&
    typeof v.lng === "number" &&
    isFinite(v.lng)
  );
}

/** Geocode vendors missing coordinates; respects Nominatim 1 req/sec via delay. */
export async function geocodeVendorsMissingCoords(
  vendors: Vendor[],
  onProgress?: (done: number, total: number, name: string) => void
): Promise<{ vendors: Vendor[]; geocoded: number; failed: number }> {
  const need = vendors.filter((v) => v.address?.trim() && !vendorHasCoords(v));
  let geocoded = 0;
  let failed = 0;
  const byId = new Map(vendors.map((v) => [v.id, { ...v }]));

  for (let i = 0; i < need.length; i++) {
    const v = need[i];
    onProgress?.(i + 1, need.length, v.name);
    const coords = await geocodeAddress(v.address.trim());
    const current = byId.get(v.id)!;
    if (coords) {
      byId.set(v.id, {
        ...current,
        lat: coords.lat,
        lng: coords.lng,
        mapCoordsApproximate: coords.approximate === true,
      });
      geocoded++;
    } else {
      failed++;
    }
    if (i < need.length - 1) await sleep(DELAY_MS);
  }

  return {
    vendors: vendors.map((v) => byId.get(v.id) ?? v),
    geocoded,
    failed,
  };
}
