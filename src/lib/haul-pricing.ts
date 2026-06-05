import { HaulRate, LegacyHaulRate, MaterialPriceUnit } from "./types";

export const TONS_PER_LOAD = 21.5;
export const CY_PER_LOAD = 18;
export const MIN_HAUL_MILES = 1;
export const MAX_HAUL_MILES = 150;

export function normalizeHaulRate(raw: LegacyHaulRate): HaulRate {
  if (typeof raw.miles === "number" && typeof raw.ratePerLoad === "number") {
    return {
      id: raw.id,
      miles: Math.round(raw.miles),
      ratePerLoad: raw.ratePerLoad,
    };
  }
  const miles = Math.round(raw.minMiles ?? raw.miles ?? 1);
  const ratePerLoad = raw.ratePerLoad ?? raw.ratePerTon ?? 0;
  return { id: raw.id, miles, ratePerLoad };
}

export function lookupHaulRateByMiles(miles: number, haulRates: HaulRate[]): HaulRate | null {
  if (!haulRates.length) return null;
  const rounded = Math.max(MIN_HAUL_MILES, Math.min(MAX_HAUL_MILES, Math.ceil(miles)));
  const exact = haulRates.find((h) => h.miles === rounded);
  if (exact) return exact;
  const sorted = [...haulRates].sort((a, b) => a.miles - b.miles);
  return sorted.find((h) => h.miles >= rounded) ?? sorted[sorted.length - 1] ?? null;
}

export function haulBuyRateForUnit(ratePerLoad: number, unit?: MaterialPriceUnit): number {
  const u = unit ?? "TN";
  if (u === "LD") return ratePerLoad;
  if (u === "CY") return ratePerLoad / CY_PER_LOAD;
  return ratePerLoad / TONS_PER_LOAD;
}

export function impliedRatePerTon(ratePerLoad: number): number {
  return Math.round((ratePerLoad / TONS_PER_LOAD) * 100) / 100;
}

export function impliedRatePerCy(ratePerLoad: number): number {
  return Math.round((ratePerLoad / CY_PER_LOAD) * 100) / 100;
}
