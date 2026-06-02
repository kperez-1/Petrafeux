import { Db } from "./types";

const STORAGE_KEY = "petrafi_db_v1";

const EMPTY_DB: Db = {
  projects: [],
  quotes: [],
  contractors: [],
  vendors: [],
  materials: [],
  haulRates: [],
  meta: { quoteCounter: 0 },
};

export function isRemote(): boolean {
  return process.env.NEXT_PUBLIC_CRM_REMOTE === "true";
}

// ── Local (browser localStorage) ─────────────────────────────────────────────

export function loadLocal(): Db {
  if (typeof window === "undefined") return EMPTY_DB;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DB;
    return { ...EMPTY_DB, ...JSON.parse(raw) };
  } catch {
    return EMPTY_DB;
  }
}

export function saveLocal(db: Db): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

// ── Remote (Cloudflare D1 via API) ───────────────────────────────────────────

export async function loadRemote(): Promise<Db> {
  const res = await fetch("/api/db");
  if (!res.ok) throw new Error("Failed to load data");
  return res.json();
}

export async function saveRemote(db: Db): Promise<void> {
  const res = await fetch("/api/db", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(db),
  });
  if (!res.ok) throw new Error("Failed to save data");
}

// ── Quote number generator ────────────────────────────────────────────────────

export function generateQuoteNumber(counter: number): string {
  return `PRP${String(counter).padStart(9, "0")}`;
}
