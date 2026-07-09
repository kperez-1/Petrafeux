"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FolderOpen,
  FileText,
  ClipboardList,
  Truck,
  Ticket,
  Route,
  MapPin,
  Users,
  Store,
  Package,
  Settings,
  ChevronDown,
  Calendar,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDb } from "@/components/DbProvider";
import { useActiveOffice } from "@/components/ActiveOfficeProvider";
import { resolveCurrentUser } from "@/lib/current-user";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SALES: NavItem[] = [
  { label: "Projects", href: "/projects/dashboard", icon: FolderOpen },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Orders", href: "/orders", icon: ClipboardList },
  { label: "Activities", href: "/activities", icon: Calendar },
];

const OPERATIONS: NavItem[] = [
  { label: "Dispatch", href: "/dispatch", icon: Truck },
  { label: "Tickets Inbox", href: "/tickets", icon: Ticket },
  { label: "Trips", href: "/trips", icon: Route },
];

const RESOURCES: NavItem[] = [
  { label: "Contractors", href: "/contractors", icon: Users },
  { label: "Vendors", href: "/vendors", icon: Store },
  { label: "Materials", href: "/materials", icon: Package },
  { label: "Motor Carriers", href: "/carriers", icon: Truck },
  { label: "Haul Rates", href: "/haul-rates", icon: Route },
  { label: "Vendor Map", href: "/vendor-map", icon: MapPin },
];

const BILLING: NavItem[] = [
  { label: "Accounts Receivable", href: "/billing/invoices", icon: ClipboardList },
  { label: "Accounts Payable", href: "/billing/ap", icon: Wallet },
];

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active =
    pathname === item.href ||
    (item.href !== "/projects/dashboard" && pathname.startsWith(item.href + "/")) ||
    (item.href === "/projects/dashboard" &&
      pathname.startsWith("/projects") &&
      !pathname.startsWith("/projects/list")) ||
    (item.href === "/home" && pathname === "/");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-[#134e3a] text-white"
          : "text-gray-600 hover:bg-[#e6eeeb] hover:text-gray-900"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1 px-3 py-1 text-xs font-medium uppercase tracking-wider text-gray-400">
      {label}
      <ChevronDown className="h-3 w-3" />
    </div>
  );
}

export function Sidebar() {
  const { db } = useDb();
  const { office, offices, setOfficeId } = useActiveOffice();
  const user = resolveCurrentUser(db);
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "AU";

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col bg-[#f0f4f2] border-r border-gray-200">
      <Link href="/home" className="flex items-center gap-2 px-4 py-4 hover:opacity-90">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
          P
        </div>
        <span className="text-sm font-semibold text-gray-900">Petrafi</span>
      </Link>

      <div className="relative mx-3 mb-3">
        <div className="flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-200 text-[10px] font-bold text-gray-700">
            {office.code?.slice(0, 2) ?? "AT"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-900">{office.name}</p>
            <p className="text-[10px] text-gray-400">{office.code}</p>
          </div>
          <ChevronDown className="h-3 w-3 text-gray-400 pointer-events-none" />
        </div>
        <select
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={office.id}
          onChange={(e) => setOfficeId(e.target.value)}
          aria-label="Switch office"
        >
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code} — {o.name}
            </option>
          ))}
        </select>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="mb-1">
          <NavLink item={{ label: "Home", href: "/home", icon: Home }} />
        </div>

        <div className="mb-1 mt-2">
          <SectionLabel label="Sales" />
          {SALES.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        <div className="mb-1 mt-4">
          <SectionLabel label="Operations" />
          {OPERATIONS.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        <div className="mb-1 mt-4">
          <SectionLabel label="Resources" />
          {RESOURCES.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        <div className="mb-1 mt-4">
          <SectionLabel label="Billing" />
          {BILLING.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>

      <div className="border-t border-gray-200 px-2 py-3 space-y-1">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-[#e6eeeb] hover:text-gray-900"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <div className="flex items-center gap-2 rounded-md px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-300 text-xs font-medium text-gray-700">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-900">
              {user?.name ?? "Admin User"}
            </p>
            <p className="truncate text-[10px] text-gray-400 capitalize">
              {user?.role ?? "admin"}
              {office ? ` · ${office.code}` : ""}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
