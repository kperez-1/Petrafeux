import { Quote, QuoteRoute, HaulRate } from "./types";

export interface RouteCalc {
  haulSubtotal: number;
  materialSubtotal: number;
  routeSubtotal: number;
}

export interface QuoteCalc {
  routes: RouteCalc[];
  subtotal: number;
  taxableSubtotal: number;
  tax: number;
  total: number;
  haulingGP: number;
  materialGP: number;
  totalGP: number;
}

export function calcRoute(route: QuoteRoute): RouteCalc {
  const haulSubtotal = route.haulRate * route.haulQty;
  const materialSubtotal = route.materialCost * route.materialQty;
  return {
    haulSubtotal,
    materialSubtotal,
    routeSubtotal: haulSubtotal + materialSubtotal,
  };
}

export function calcQuote(quote: Quote): QuoteCalc {
  const routes = quote.routes.map(calcRoute);
  const subtotal = routes.reduce((s, r) => s + r.routeSubtotal, 0);
  const taxableSubtotal = quote.routes.reduce((s, r, i) => {
    return r.taxable ? s + routes[i].routeSubtotal : s;
  }, 0);
  const tax = taxableSubtotal * (quote.taxRate / 100);
  const total = subtotal + tax;

  // GP: sell - cost (materialRate is buy price, materialCost is sell price per our model)
  const haulingGP = quote.routes.reduce((s, r) => {
    // haulCost = our cost basis, haulRate = sell rate
    return s + (r.haulRate - r.haulCost) * r.haulQty;
  }, 0);
  const materialGP = quote.routes.reduce((s, r) => {
    // materialRate = buy price, materialCost = sell price
    return s + (r.materialCost - r.materialRate) * r.materialQty;
  }, 0);

  return { routes, subtotal, taxableSubtotal, tax, total, haulingGP, materialGP, totalGP: haulingGP + materialGP };
}

/** Find the matching haul rate zone for a given mileage */
export function lookupHaulRate(miles: number, haulRates: HaulRate[]): number {
  const match = haulRates.find((h) => miles >= h.minMiles && miles < h.maxMiles);
  return match?.ratePerTon ?? 0;
}

/** Geocode an address using Nominatim (free, no API key) */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { "User-Agent": "petrafi-inspiration/1.0" } });
    const data = await res.json();
    if (!data?.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

/** Calculate straight-line distance in miles between two lat/lng points */
export function straightLineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
