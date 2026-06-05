import { Db, User } from "./types";

const STORAGE_KEY = "petrafi_current_user_id";

export function getStoredCurrentUserId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(STORAGE_KEY) ?? undefined;
}

export function setStoredCurrentUserId(id: string | undefined): void {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(STORAGE_KEY, id);
  else localStorage.removeItem(STORAGE_KEY);
}

export function resolveCurrentUser(db: Db): User | undefined {
  const id = db.meta.currentUserId ?? getStoredCurrentUserId();
  if (!id) return db.users.find((u) => u.role === "admin") ?? db.users[0];
  return db.users.find((u) => u.id === id);
}
