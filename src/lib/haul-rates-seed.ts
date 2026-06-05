import { HaulRate } from "./types";

export const BUNDLED_HAUL_RATES_PATH = "/data/haul-rates-per-mile.txt";

function parseMoney(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, "")) || 0;
}

/** Parse tab-separated haul rates file (header + one mile per line). */
export function parseHaulRatesTxt(raw: string): HaulRate[] {
  const lines = raw.split(/\r?\n/).slice(1);
  const rates: HaulRate[] = [];
  for (const line of lines) {
    const parts = line.split(/\t/);
    if (parts.length < 2) continue;
    const miles = parseInt(parts[0].trim(), 10);
    const ratePerLoad = parseMoney(parts[1]);
    if (!miles || !ratePerLoad) continue;
    rates.push({ id: `haul-${miles}`, miles, ratePerLoad });
  }
  return rates.sort((a, b) => a.miles - b.miles);
}

/** Load 150 per-mile rates from bundled public txt (browser-safe). */
export async function fetchBundledHaulRates(): Promise<HaulRate[]> {
  const res = await fetch(BUNDLED_HAUL_RATES_PATH);
  if (!res.ok) throw new Error("Failed to load haul rates file");
  const text = await res.text();
  const rates = parseHaulRatesTxt(text);
  if (rates.length === 0) throw new Error("No haul rates parsed");
  return rates;
}
