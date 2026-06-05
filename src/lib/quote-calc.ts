import { Quote, QuoteRoute, HaulRate, MaterialPriceUnit, normalizeMaterialUnit } from "./types";
import { DEFAULT_HAUL_BROKER_FEE_PERCENT, getBrokerFeePercent } from "./db-defaults";
import type { DbMeta } from "./types";
import { getRouteMaterials } from "./route-materials";
import {
  DEFAULT_HAUL_GP_PERCENT,
  DEFAULT_MATERIAL_GP_PERCENT,
  haulGpPercent,
  haulSellFromBuyGp,
  materialGpPercent,
  materialSellFromBuyGp,
  netHaulBuyRate,
} from "./margin-calc";
import { haulBuyRateForUnit, lookupHaulRateByMiles } from "./haul-pricing";

export {
  DEFAULT_HAUL_GP_PERCENT,
  DEFAULT_MATERIAL_GP_PERCENT,
  haulGpPercent,
  haulSellFromBuyGp,
  materialGpPercent,
  materialSellFromBuyGp,
  netHaulBuyRate,
};

/** @deprecated Use getBrokerFeePercent(db.meta) */
export function getHaulingBrokerFeePercentLegacy(): number {
  return DEFAULT_HAUL_BROKER_FEE_PERCENT;
}

export function haulBrokerIncomePerTon(buyPerTon: number, brokerFeePercent: number): number {
  return buyPerTon * (brokerFeePercent / 100);
}

export function calcHaulBrokerIncome(route: QuoteRoute, brokerFeePercent: number): number {
  return haulBrokerIncomePerTon(route.haulCost, brokerFeePercent) * route.haulQty;
}

export function calcHaulingGP(route: QuoteRoute, brokerFeePercent: number): number {
  return (route.haulRate - netHaulBuyRate(route.haulCost, brokerFeePercent)) * route.haulQty;
}

export interface RouteCalc {
  haulSubtotal: number;
  haulBrokerIncome: number;
  haulNetBuyCost: number;
  materialSubtotal: number;
  routeSubtotal: number;
}

export interface QuoteCalc {
  routes: RouteCalc[];
  subtotal: number;
  haulSubtotal: number;
  materialSubtotal: number;
  taxableSubtotal: number;
  tax: number;
  total: number;
  haulBrokerIncome: number;
  haulingGP: number;
  materialGP: number;
  totalGP: number;
}

export interface AllInRate {
  /** Combined sell $/unit when material and haul share a unit; null when they differ */
  combined: number | null;
  materialSell: number;
  haulSell: number;
  unit: MaterialPriceUnit;
  haulUnit: MaterialPriceUnit;
}

/** All-in delivered sell rate per unit = material sell + haul sell (when units match). */
export function allInUnitRate(
  materialSell: number,
  materialUnit: MaterialPriceUnit | undefined,
  haulSell: number,
  haulUnit: MaterialPriceUnit | undefined
): AllInRate {
  const unit = normalizeMaterialUnit(materialUnit);
  const hUnit = normalizeMaterialUnit(haulUnit);
  return {
    combined: unit === hUnit ? Math.round((materialSell + haulSell) * 100) / 100 : null,
    materialSell,
    haulSell,
    unit,
    haulUnit: hUnit,
  };
}

export function calcRouteMaterialSubtotal(route: QuoteRoute): number {
  return getRouteMaterials(route).reduce(
    (s, line) => s + line.materialCost * line.materialQty,
    0
  );
}

export function calcRoute(route: QuoteRoute, brokerFeePercent: number): RouteCalc {
  const haulSubtotal = route.haulRate * route.haulQty;
  const haulBrokerIncome = calcHaulBrokerIncome(route, brokerFeePercent);
  const haulNetBuyCost = netHaulBuyRate(route.haulCost, brokerFeePercent) * route.haulQty;
  const materialSubtotal = calcRouteMaterialSubtotal(route);
  return {
    haulSubtotal,
    haulBrokerIncome,
    haulNetBuyCost,
    materialSubtotal,
    routeSubtotal: haulSubtotal + materialSubtotal,
  };
}

export function calcQuote(quote: Quote, meta?: DbMeta): QuoteCalc {
  const brokerFeePercent = getBrokerFeePercent(meta);
  const routes = quote.routes.map((r) => calcRoute(r, brokerFeePercent));
  const haulSubtotal = routes.reduce((s, r) => s + r.haulSubtotal, 0);
  const materialSubtotal = routes.reduce((s, r) => s + r.materialSubtotal, 0);
  const subtotal = haulSubtotal + materialSubtotal;
  const taxableSubtotal = quote.routes.reduce((s, r, i) => {
    return r.taxable ? s + routes[i].materialSubtotal : s;
  }, 0);
  const tax = taxableSubtotal * (quote.taxRate / 100);
  const total = subtotal + tax;

  const haulBrokerIncome = quote.routes.reduce(
    (s, r) => s + calcHaulBrokerIncome(r, brokerFeePercent),
    0
  );
  const haulingGP = quote.routes.reduce(
    (s, r) => s + calcHaulingGP(r, brokerFeePercent),
    0
  );
  const materialGP = quote.routes.reduce((s, r) => {
    return (
      s +
      getRouteMaterials(r).reduce(
        (ls, line) => ls + (line.materialCost - line.materialRate) * line.materialQty,
        0
      )
    );
  }, 0);

  return {
    routes,
    subtotal,
    haulSubtotal,
    materialSubtotal,
    taxableSubtotal,
    tax,
    total,
    haulBrokerIncome,
    haulingGP,
    materialGP,
    totalGP: haulBrokerIncome + haulingGP + materialGP,
  };
}

/** @deprecated Use lookupHaulRateByMiles from haul-pricing */
export function lookupHaulRate(miles: number, haulRates: HaulRate[]): HaulRate | null {
  return lookupHaulRateByMiles(miles, haulRates);
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; approximate?: boolean } | null> {
  if (!address.trim()) return null;
  try {
    const url = `/api/geocode?address=${encodeURIComponent(address.trim())}`;
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    const ok = res.ok && typeof body.lat === "number" && typeof body.lng === "number";
    if (!ok) return null;
    return {
      lat: body.lat,
      lng: body.lng,
      approximate: body.approximate === true,
    };
  } catch {
    return null;
  }
}

export function straightLineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface HaulRateSuggestion {
  miles: number;
  mileLabel: string;
  ratePerLoad: number;
  buyRate: number;
  sellRate: number;
  haulUnit: MaterialPriceUnit;
  /** True when road routing failed and the distance fell back to straight-line. */
  approximate: boolean;
}

/**
 * Road driving miles between two points via /api/route (OSRM) — the SAME source
 * the vendor map uses, so the editor and map agree. Returns null on failure so
 * callers can fall back to straight-line.
 */
async function roadMilesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): Promise<number | null> {
  try {
    const res = await fetch(`/api/route?from=${a.lat},${a.lng}&to=${b.lat},${b.lng}`);
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      if (typeof body.miles === "number" && isFinite(body.miles)) return body.miles;
    }
  } catch {
    // fall through to straight-line
  }
  return null;
}

/** Geocode pickup/dropoff, lookup per-mile load rate, suggest buy + sell by haul unit */
export async function suggestHaulRatesFromAddresses(
  pickup: string,
  dropoff: string,
  haulRates: HaulRate[],
  haulUnit: MaterialPriceUnit = "TN"
): Promise<HaulRateSuggestion | null> {
  const [pickupCoords, dropoffCoords] = await Promise.all([
    geocodeAddress(pickup),
    geocodeAddress(dropoff),
  ]);
  if (!pickupCoords || !dropoffCoords) return null;

  // Use road driving miles (matches the vendor map); fall back to straight-line.
  const road = await roadMilesBetween(pickupCoords, dropoffCoords);
  const rawMiles =
    road ??
    straightLineMiles(
      pickupCoords.lat,
      pickupCoords.lng,
      dropoffCoords.lat,
      dropoffCoords.lng
    );
  const miles = Math.round(rawMiles * 10) / 10;

  const row = lookupHaulRateByMiles(miles, haulRates);
  if (!row) return null;

  const buyRate = haulBuyRateForUnit(row.ratePerLoad, haulUnit);
  const sellRate = haulSellFromBuyGp(
    buyRate,
    DEFAULT_HAUL_BROKER_FEE_PERCENT,
    DEFAULT_HAUL_GP_PERCENT
  );

  return {
    miles,
    mileLabel: `Mile ${row.miles}`,
    ratePerLoad: row.ratePerLoad,
    buyRate,
    sellRate,
    haulUnit,
    approximate: road == null,
  };
}
