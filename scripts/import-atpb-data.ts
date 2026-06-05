/**
 * One-time ATPB data import: offices, quarries, customers, haul rates.
 * Usage: npx tsx scripts/import-atpb-data.ts
 * Env: ATPB_DATA_DIR (default: ~/Documents/short term use)
 */
import { promises as fs } from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { Db, User, Vendor, HaulRate } from "../src/lib/types";
import { EMPTY_DB, seedOffices, officeIdForCode } from "../src/lib/db-defaults";
import { normalizeFullDb } from "../src/lib/normalize-db";
import { generateId } from "../src/lib/utils";
import { parseHaulRatesTxt } from "../src/lib/haul-rates-seed";
import {
  defaultCustomersFilePath,
  loadContractorsFromWorkbook,
  mergeImportUsers,
} from "../src/lib/import-contractors";

const DATA_DIR =
  process.env.ATPB_DATA_DIR ??
  path.join(process.env.USERPROFILE ?? process.env.HOME ?? "", "Documents", "short term use");

const QUARRIES_FILE = path.join(DATA_DIR, "ATPB Quarries.xlsx");
const CUSTOMERS_FILE =
  process.env.ATPB_CUSTOMERS_FILE ?? defaultCustomersFilePath(DATA_DIR);
const HAUL_FILE_REPO = path.join(process.cwd(), "data", "haul-rates-per-mile.txt");
const HAUL_FILE_EXTERNAL = path.join(DATA_DIR, "Haul rates per mile.txt");
const OUT_FILE = path.join(process.cwd(), ".data", "petrafi-db.json");

function cellStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

async function loadHaulRates(): Promise<HaulRate[]> {
  let file = HAUL_FILE_REPO;
  try {
    await fs.access(HAUL_FILE_REPO);
  } catch {
    file = HAUL_FILE_EXTERNAL;
  }
  const raw = await fs.readFile(file, "utf-8");
  return parseHaulRatesTxt(raw);
}

function loadQuarries(): Vendor[] {
  const wb = XLSX.readFile(QUARRIES_FILE);
  const sheet = wb.Sheets[wb.SheetNames.find((n) => n.includes("Loading")) ?? wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const vendors: Vendor[] = [];
  for (const row of rows) {
    const name = cellStr(row["Site Name"] ?? row["Site name"] ?? row["NAME"]);
    if (!name) continue;
    const street = cellStr(
      row["Street Address"] ?? row["Street"] ?? row["STREET"] ?? row["Street address"]
    );
    const city = cellStr(row["City"] ?? row["CITY"]);
    const state = cellStr(row["State"] ?? row["STATE"]);
    const zip = cellStr(row["ZIP"] ?? row["Zip"]);
    const address = [street, city, state, zip].filter(Boolean).join(", ");
    const latRaw = cellStr(row["Latitude"] ?? row["Lat"] ?? row["latitude"]);
    const lngRaw = cellStr(row["Longitude"] ?? row["Lng"] ?? row["longitude"]);
    const lat = latRaw ? parseFloat(latRaw) : undefined;
    const lng = lngRaw ? parseFloat(lngRaw) : undefined;
    vendors.push({
      id: generateId(),
      name: name.trim(),
      address,
      type: "quarry",
      ...(lat != null && isFinite(lat) && lng != null && isFinite(lng) ? { lat, lng } : {}),
    });
  }
  return vendors;
}

async function main() {
  console.log("Data directory:", DATA_DIR);
  let db: Db = { ...EMPTY_DB, offices: seedOffices() };
  try {
    const existing = await fs.readFile(OUT_FILE, "utf-8");
    db = normalizeFullDb(JSON.parse(existing));
    console.log("Loaded existing DB from", OUT_FILE);
  } catch {
    console.log("Starting fresh DB");
  }

  const userMap = new Map<string, User>();
  for (const u of db.users) {
    userMap.set(u.name.toLowerCase(), u);
  }

  const adminUser: User = {
    id: db.users.find((u) => u.role === "admin")?.id ?? generateId(),
    name: "Admin",
    role: "admin",
    officeId: officeIdForCode("ATPB"),
  };
  if (!db.users.some((u) => u.role === "admin")) {
    userMap.set("admin", adminUser);
  }

  const vendors = loadQuarries();
  const { contractors, userMap: updatedMap } = loadContractorsFromWorkbook(CUSTOMERS_FILE, userMap);
  const haulRates = await loadHaulRates();
  const users = mergeImportUsers(db.users, [...updatedMap.values()]);
  if (!users.some((u) => u.role === "admin")) {
    users.unshift(adminUser);
  }

  const merged: Db = normalizeFullDb({
    ...db,
    offices: seedOffices(),
    users,
    vendors,
    contractors,
    haulRates,
    meta: {
      ...db.meta,
      orgName: "AT of Palm Beach",
      orgCode: "ATPB",
    },
  });

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2), "utf-8");

  console.log("Import complete:");
  console.log("  offices:", merged.offices.length);
  console.log("  users:", merged.users.length);
  console.log("  vendors:", merged.vendors.length);
  console.log("  contractors:", merged.contractors.length);
  console.log("  haul rates:", merged.haulRates.length);
  console.log("  written to:", OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
