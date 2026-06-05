import { Db } from "./types";
import { normalizeDb } from "./db-defaults";
import { normalizeRouteMaterials } from "./route-materials";

/** Full DB normalization including quote routes (avoids circular import in db-defaults) */
export function normalizeFullDb(raw: Partial<Db> | null | undefined): Db {
  const db = normalizeDb(raw);
  return {
    ...db,
    haulRates: db.haulRates ?? [],
    quotes: db.quotes.map((q) => ({
      ...q,
      history: q.history ?? [{ id: "created", type: "created" as const, at: q.createdAt }],
      routes: (q.routes ?? []).map(normalizeRouteMaterials),
    })),
  };
}
