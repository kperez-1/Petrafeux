"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapPin, Bell, ChevronRight } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { buildAppBreadcrumbs } from "@/lib/app-breadcrumbs";
import { resolveCurrentUser } from "@/lib/current-user";

function dispatchMapHref(pathname: string): string {
  const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (projectMatch && projectMatch[1] !== "dashboard" && projectMatch[1] !== "list") {
    return `/vendor-map?projectId=${projectMatch[1]}`;
  }
  const quoteMatch = pathname.match(/^\/quotes\/([^/]+)/);
  if (quoteMatch) {
    return `/vendor-map?quoteId=${quoteMatch[1]}`;
  }
  return "/vendor-map";
}

export function AppTopBar() {
  const pathname = usePathname();
  const { db } = useDb();
  const items = buildAppBreadcrumbs(pathname, db);
  const user = resolveCurrentUser(db);
  const mapHref = dispatchMapHref(pathname);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "AU";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      <nav className="flex min-w-0 items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        {items.map((item, i) => (
          <span key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />}
            {item.href ? (
              <Link href={item.href} className="truncate hover:text-gray-900">
                {item.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-gray-900">{item.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-3">
        <Link
          href={mapHref}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <MapPin className="h-4 w-4" />
          <span>Dispatch Map</span>
        </Link>
        <button
          type="button"
          className="text-gray-400 hover:text-gray-600"
          aria-label="Notifications"
          disabled
        >
          <Bell className="h-4 w-4" />
        </button>
        <Link
          href="/settings"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-300"
          title={user?.name ?? "Settings"}
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
