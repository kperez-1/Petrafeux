import { Db, Vendor } from "./types";
import { normalizeFullDb } from "./normalize-db";
import { mergeImportUsers } from "./import-contractors";

function vendorCoords(v: Vendor): { lat: number; lng: number } | null {
  if (typeof v.lat === "number" && isFinite(v.lat) && typeof v.lng === "number" && isFinite(v.lng)) {
    return { lat: v.lat, lng: v.lng };
  }
  return null;
}

/** Keep geocoded lat/lng from local vendors when server file has addresses only. */
function mergeServerVendorsWithLocalCoords(serverVendors: Vendor[], localVendors: Vendor[]): Vendor[] {
  const byId = new Map(localVendors.map((v) => [v.id, v]));
  const byName = new Map(
    localVendors.map((v) => [v.name.trim().toLowerCase(), v])
  );
  return serverVendors.map((sv) => {
    const local = byId.get(sv.id) ?? byName.get(sv.name.trim().toLowerCase());
    const coords = local ? vendorCoords(local) : null;
    return coords ? { ...sv, lat: coords.lat, lng: coords.lng } : sv;
  });
}

/** Load database from Next.js API (reads .data/petrafi-db.json in dev). */
export async function fetchServerDb(): Promise<Db> {
  const res = await fetch("/api/db");
  if (!res.ok) throw new Error("Could not load imported data from server");
  return normalizeFullDb(await res.json());
}

const MIN_QUARRIES_BEFORE_SKIP = 10;

/**
 * Merge ATPB master data from server file into local browser DB
 * without overwriting projects, quotes, or contractors the user already has.
 */
export function mergeAtpbMasterData(local: Db, server: Db): Db {
  const localQuarries = local.vendors.filter((v) => v.type === "quarry").length;
  const serverQuarries = server.vendors.filter((v) => v.type === "quarry").length;

  let next = local;

  if (serverQuarries >= MIN_QUARRIES_BEFORE_SKIP && localQuarries < MIN_QUARRIES_BEFORE_SKIP) {
    next = {
      ...next,
      vendors: mergeServerVendorsWithLocalCoords(server.vendors, local.vendors),
    };
  }

  if (!next.users.length && server.users.length) {
    next = { ...next, users: server.users };
  }

  if (!next.offices.length && server.offices.length) {
    next = { ...next, offices: server.offices };
  }

  if (!next.haulRates.length && server.haulRates.length) {
    next = { ...next, haulRates: server.haulRates };
  }

  return next;
}

/** Replace local contractors and merge salesperson users from server import file. */
export function replaceContractorsFromServer(local: Db, server: Db): Db {
  return {
    ...local,
    contractors: server.contractors,
    users: mergeImportUsers(local.users, server.users),
  };
}

export async function hydrateLocalDbFromServer(local: Db): Promise<Db> {
  try {
    const server = await fetchServerDb();
    const merged = mergeAtpbMasterData(local, server);
    const changed =
      merged.vendors.length !== local.vendors.length ||
      merged.users.length !== local.users.length ||
      merged.haulRates.length !== local.haulRates.length;
    return changed ? merged : local;
  } catch {
    return local;
  }
}
