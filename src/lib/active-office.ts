import { Db, Office, User } from "./types";
import { resolveCurrentUser } from "./current-user";

const STORAGE_KEY = "petrafi_active_office_id";

const BASE_INTERNAL_OFFICE_DOMAINS = ["alliedtk.com", "petrafi.com"];

export function getStoredActiveOfficeId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(STORAGE_KEY) ?? undefined;
}

export function setStoredActiveOfficeId(id: string | undefined): void {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(STORAGE_KEY, id);
  else localStorage.removeItem(STORAGE_KEY);
}

export function officesForUser(db: Db, _user?: User): Office[] {
  return db.offices;
}

export function resolveActiveOffice(db: Db, user?: User): Office | undefined {
  const u = user ?? resolveCurrentUser(db);
  const stored = getStoredActiveOfficeId();
  if (stored) {
    const found = db.offices.find((o) => o.id === stored);
    if (found) return found;
  }
  if (u?.officeId) {
    const fromUser = db.offices.find((o) => o.id === u.officeId);
    if (fromUser) return fromUser;
  }
  return db.offices[0];
}

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function getInternalEmailDomains(db?: Db): string[] {
  const domains = new Set(BASE_INTERNAL_OFFICE_DOMAINS);
  const user = db ? resolveCurrentUser(db) : undefined;
  const userDomain = user?.email ? emailDomain(user.email) : "";
  if (userDomain) domains.add(userDomain);
  return [...domains];
}
