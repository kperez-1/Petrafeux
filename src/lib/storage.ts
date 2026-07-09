import { Db } from "./types";
import { EMPTY_DB } from "./db-defaults";
import { normalizeFullDb } from "./normalize-db";

const STORAGE_KEY = "petrafi_db_v1";

export function isRemote(): boolean {
  if (process.env.NEXT_PUBLIC_CRM_REMOTE === "true") return true;
  // wrangler.jsonc vars apply at Workers runtime only; client bundles need a
  // runtime host check when NEXT_PUBLIC_* was not set at build time.
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.endsWith(".workers.dev")) return true;
  }
  return false;
}

// ── Local (browser localStorage) ─────────────────────────────────────────────

export function loadLocal(): Db {
  if (typeof window === "undefined") return EMPTY_DB;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DB;
    return normalizeFullDb(JSON.parse(raw));
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

export function generateOrderNumber(counter: number): string {
  return `ORD${String(counter).padStart(9, "0")}`;
}

export function generateInvoiceNumber(counter: number): string {
  return `INV${String(counter).padStart(9, "0")}`;
}

export function generateSettlementNumber(counter: number): string {
  return `STL${String(counter).padStart(9, "0")}`;
}

export function generateVendorSettlementNumber(counter: number): string {
  return `VAP${String(counter).padStart(9, "0")}`;
}

export function generateTripNumber(counter: number): string {
  return `TRP${String(counter).padStart(9, "0")}`;
}

export function generateTicketNumber(counter: number): string {
  return `TKT${String(counter).padStart(9, "0")}`;
}
