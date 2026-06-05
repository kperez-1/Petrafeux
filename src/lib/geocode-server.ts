/**
 * Server-side geocoding with fallbacks for US vendor addresses.
 * Nominatim (OSM) misses many rural/industrial sites; US Census often has them.
 */

export type GeocodeSource = "nominatim" | "census" | "city_approx";

export interface GeocodeResult {
  lat: number;
  lng: number;
  source: GeocodeSource;
}

/** "Street, City, FL, 33470" → "Street, City, FL 33470" for geocoder APIs */
export function normalizeUsAddress(address: string): string {
  return address
    .replace(/\s+/g, " ")
    .replace(/,\s*([A-Za-z]{2})\s*,\s*(\d{5}(?:-\d{4})?)\b/g, ", $1 $2")
    .trim();
}

/** Parse "street, city, ST, zip" or "street, city, ST zip" (ATPB import styles). */
export function parseUsAddressParts(address: string): {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
} | null {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const last = parts[parts.length - 1];
  const zipOnly = last.match(/^(\d{5}(?:-\d{4})?)$/);
  const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/i);

  let state: string | undefined;
  let zip: string | undefined;
  let city: string | undefined;
  let tailCount: number;

  if (zipOnly) {
    zip = zipOnly[1];
    const statePart = parts[parts.length - 2];
    const stateMatch = statePart?.match(/^([A-Za-z]{2})$/);
    if (!stateMatch || parts.length < 3) return null;
    state = stateMatch[1].toUpperCase();
    city = parts[parts.length - 3];
    tailCount = 3;
  } else if (stateZip) {
    state = stateZip[1].toUpperCase();
    zip = stateZip[2];
    city = parts.length >= 3 ? parts[parts.length - 2] : undefined;
    tailCount = 2;
  } else {
    return null;
  }

  if (!city) return null;
  const street = parts.slice(0, parts.length - tailCount).join(", ");
  return {
    street: street || undefined,
    city,
    state,
    zip,
  };
}

function cityFallbackQuery(parts: ReturnType<typeof parseUsAddressParts>): string | null {
  if (!parts?.city || !parts.state) return null;
  return parts.zip
    ? `${parts.city}, ${parts.state} ${parts.zip}, USA`
    : `${parts.city}, ${parts.state}, USA`;
}

async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "petrafi-inspiration/1.0 (local CRM; contact: dev@petrafi.local)",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.startsWith("[")) return null;
  const data = JSON.parse(text) as { lat?: string; lon?: string }[];
  if (!data.length) return null;
  const lat = parseFloat(String(data[0].lat));
  const lng = parseFloat(String(data[0].lon));
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng, source: "nominatim" };
}

async function geocodeCensus(oneLine: string): Promise<GeocodeResult | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(oneLine)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] };
  };
  const match = json.result?.addressMatches?.[0];
  const x = match?.coordinates?.x;
  const y = match?.coordinates?.y;
  if (typeof x !== "number" || typeof y !== "number" || !isFinite(x) || !isFinite(y)) {
    return null;
  }
  return { lat: y, lng: x, source: "census" };
}

/** Try Nominatim → US Census → city/zip centroid (approximate). */
export async function geocodeAddressServer(address: string): Promise<GeocodeResult | null> {
  const normalized = normalizeUsAddress(address);
  if (!normalized) return null;

  const nominatim = await geocodeNominatim(normalized);
  if (nominatim) return nominatim;

  const census = await geocodeCensus(normalized);
  if (census) return census;

  const parts = parseUsAddressParts(normalized);
  const cityQuery = cityFallbackQuery(parts);
  if (cityQuery) {
    const approx = await geocodeNominatim(cityQuery);
    if (approx) return { ...approx, source: "city_approx" };
  }

  return null;
}
