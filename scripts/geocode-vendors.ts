/**
 * Geocode all vendors missing lat/lng (server-side, ~1.1s per vendor).
 * Usage: npm run geocode:vendors
 */
import { promises as fs } from "fs";
import path from "path";
import { normalizeFullDb } from "../src/lib/normalize-db";
import { geocodeAddressServer } from "../src/lib/geocode-server";

const OUT_FILE = path.join(process.cwd(), ".data", "petrafi-db.json");
const DELAY_MS = 1100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasCoords(v: { lat?: number; lng?: number }) {
  return (
    typeof v.lat === "number" &&
    isFinite(v.lat) &&
    typeof v.lng === "number" &&
    isFinite(v.lng)
  );
}

async function main() {
  const raw = await fs.readFile(OUT_FILE, "utf-8");
  const db = normalizeFullDb(JSON.parse(raw));
  const vendors = [...db.vendors];
  let geocoded = 0;
  let failed = 0;

  for (let i = 0; i < vendors.length; i++) {
    const v = vendors[i];
    if (hasCoords(v) || !v.address?.trim()) continue;
    process.stdout.write(`[${i + 1}/${vendors.length}] ${v.name}… `);
    const result = await geocodeAddressServer(v.address);
    if (result) {
      vendors[i] = { ...v, lat: result.lat, lng: result.lng };
      geocoded++;
      console.log(result.source, result.lat, result.lng);
    } else {
      failed++;
      console.log("FAILED");
    }
    await sleep(DELAY_MS);
  }

  const merged = normalizeFullDb({ ...db, vendors });
  await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2), "utf-8");
  console.log("Geocoded:", geocoded, "Failed:", failed, "→", OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
