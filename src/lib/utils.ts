import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { MaterialPriceUnit, normalizeMaterialUnit } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/** Round to the nearest cent (2 decimals). */
export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Round up to the next cent (2 decimals), e.g. 4.651162 → 4.66. */
export function ceilCents(amount: number): number {
  return Math.ceil(amount * 100) / 100;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export function generateId(): string {
  return crypto.randomUUID();
}

/** Today's date as a YYYY-MM-DD string in local time (for <input type="date"> defaults/min). */
export function todayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convert any date-ish string (e.g. "Jun 12, 2026" or ISO) to YYYY-MM-DD, or "" if unparseable. */
export function toDateInputValue(input?: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a YYYY-MM-DD (or other date-ish) string as e.g. "Jun 12, 2026". Falls back to the raw input. */
export function formatDueDate(input?: string): string {
  const v = toDateInputValue(input);
  if (!v) return input?.trim() ?? "";
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMaterialPrice(amount: number, unit?: MaterialPriceUnit): string {
  const u = normalizeMaterialUnit(unit);
  return `${formatCurrency(amount)} / ${u}`;
}
