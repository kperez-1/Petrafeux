/**
 * Import per-mile haul rates only (150 rows, one line per mile).
 * Usage: npm run import:haul
 */
import { promises as fs } from "fs";
import path from "path";
import { parseHaulRatesTxt } from "../src/lib/haul-rates-seed";
import { normalizeFullDb } from "../src/lib/normalize-db";
import { EMPTY_DB } from "../src/lib/db-defaults";

const HAUL_FILE =
  process.env.HAUL_RATES_FILE ??
  path.join(process.cwd(), "data", "haul-rates-per-mile.txt");
const OUT_FILE = path.join(process.cwd(), ".data", "petrafi-db.json");

async function main() {
  const raw = await fs.readFile(HAUL_FILE, "utf-8");
  const haulRates = parseHaulRatesTxt(raw);
  console.log("Parsed", haulRates.length, "haul rates from", HAUL_FILE);

  let db = { ...EMPTY_DB };
  try {
    const existing = await fs.readFile(OUT_FILE, "utf-8");
    db = normalizeFullDb(JSON.parse(existing));
    console.log("Merged into existing DB at", OUT_FILE);
  } catch {
    console.log("Starting fresh DB");
  }

  const merged = normalizeFullDb({ ...db, haulRates });
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2), "utf-8");

  console.log("Mile 5:", merged.haulRates.find((h) => h.miles === 5)?.ratePerLoad);
  console.log("Mile 150:", merged.haulRates.find((h) => h.miles === 150)?.ratePerLoad);
  console.log("Written to", OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
