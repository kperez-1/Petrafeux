"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  FileText,
  Route,
  MapPin,
  Users,
  Store,
  Package,
  Settings,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SALES: NavItem[] = [
  { label: "Projects", href: "/projects", icon: FolderOpen },
  { label: "Quotes", href: "/quotes", icon: FileText },
];

const MASTER_DATA: NavItem[] = [
  { label: "Contractors", href: "/contractors", icon: Users },
  { label: "Vendors", href: "/vendors", icon: Store },
  { label: "Materials", href: "/materials", icon: Package },
  { label: "Haul Rates", href: "/haul-rates", icon: Route },
  { label: "Vendor Map", href: "/vendor-map", icon: MapPin },
];

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col bg-[#f0f4f2] border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
          P
        </div>
        <span className="text-sm font-semibold text-gray-900">Petrafi</span>
      </div>

      {/* Org selector */}
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-200 text-[10px] font-bold text-gray-700">
          AT
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-gray-900">AT of Palm Beach</p>
          <p className="text-[10px] text-gray-400">ATPB</p>
        </div>
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="mb-1">
          <SectionLabel label="Sales" />
          {SALES.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        <div className="mb-1 mt-4">
          <SectionLabel label="Master data" />
          {MASTER_DATA.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>

      {/* Bottom */}
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
            AU
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-900">Admin User</p>
            <p className="truncate text-[10px] text-gray-400">admin@company.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
