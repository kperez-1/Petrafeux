/**
 * Import contractors from petrafi atpb upload.xlsx (replaces contractor list).
 * Usage: npm run import:contractors
 * Env: ATPB_DATA_DIR, ATPB_CUSTOMERS_FILE
 */
import { promises as fs } from "fs";
import path from "path";
import { Db, User } from "../src/lib/types";
import { normalizeFullDb } from "../src/lib/normalize-db";
import { officeIdForCode } from "../src/lib/db-defaults";
import { generateId } from "../src/lib/utils";
import {
  defaultCustomersFilePath,
  loadContractorsFromWorkbook,
  mergeImportUsers,
} from "../src/lib/import-contractors";

const DATA_DIR =
  process.env.ATPB_DATA_DIR ??
  path.join(process.env.USERPROFILE ?? process.env.HOME ?? "", "Documents", "short term use");

const CUSTOMERS_FILE =
  process.env.ATPB_CUSTOMERS_FILE ?? defaultCustomersFilePath(DATA_DIR);

const OUT_FILE = path.join(process.cwd(), ".data", "petrafi-db.json");

async function main() {
  console.log("Customers file:", CUSTOMERS_FILE);
  let db: Db;
  try {
    db = normalizeFullDb(JSON.parse(await fs.readFile(OUT_FILE, "utf-8")));
    console.log("Loaded existing DB from", OUT_FILE);
  } catch {
    throw new Error(`No DB at ${OUT_FILE}. Run import:atpb first or create a base database.`);
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

  const { contractors, userMap: updatedMap } = loadContractorsFromWorkbook(CUSTOMERS_FILE, userMap);
  const importedUsers = [...updatedMap.values()];
  const users = mergeImportUsers(db.users, importedUsers);
  if (!users.some((u) => u.role === "admin")) {
    users.unshift(adminUser);
  }

  const merged = normalizeFullDb({
    ...db,
    contractors,
    users,
  });

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2), "utf-8");

  console.log("Contractor import complete:");
  console.log("  contractors:", merged.contractors.length);
  console.log("  users:", merged.users.length);
  console.log("  written to:", OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
