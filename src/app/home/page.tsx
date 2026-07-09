"use client";

import Link from "next/link";
import {
  FolderOpen,
  FileText,
  ClipboardList,
  Truck,
  Ticket,
  Route,
  Users,
  Store,
  Package,
  MapPin,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout";

const SECTIONS = [
  {
    title: "Sales",
    cards: [
      { label: "Projects", href: "/projects/dashboard", icon: FolderOpen, desc: "Pipeline and job folders" },
      { label: "Quotes", href: "/quotes", icon: FileText, desc: "Proposals and pricing" },
      { label: "Orders", href: "/orders", icon: ClipboardList, desc: "Customer orders from approved quotes" },
    ],
  },
  {
    title: "Operations",
    cards: [
      { label: "Dispatch", href: "/dispatch", icon: Truck, desc: "Assign carriers and trucks" },
      { label: "Tickets Inbox", href: "/tickets", icon: Ticket, desc: "Review delivery tickets" },
      { label: "Trips", href: "/trips", icon: Route, desc: "Trip history (coming soon)" },
    ],
  },
  {
    title: "Resources",
    cards: [
      { label: "Contractors", href: "/contractors", icon: Users, desc: "Customer companies" },
      { label: "Vendors", href: "/vendors", icon: Store, desc: "Quarries and disposal sites" },
      { label: "Materials", href: "/materials", icon: Package, desc: "Material catalog" },
      { label: "Motor Carriers", href: "/carriers", icon: Truck, desc: "Fleet and haulers" },
      { label: "Haul Rates", href: "/haul-rates", icon: Route, desc: "Per-mile rate tables" },
      { label: "Vendor Map", href: "/vendor-map", icon: MapPin, desc: "Map-based vendor lookup" },
    ],
  },
  {
    title: "Billing",
    cards: [
      { label: "Accounts Receivable", href: "/billing/invoices", icon: ClipboardList, desc: "Customer invoices — open and paid" },
      { label: "Accounts Payable", href: "/billing/ap", icon: Wallet, desc: "Carrier and vendor payables" },
    ],
  },
];

export default function HomePage() {
  return (
    <div className="p-8">
      <PageHeader
        icon={FolderOpen}
        title="Home"
        description="Sales, operations, resources, and billing"
      />

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
              {section.title}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.cards.map((card) => {
                const Icon = card.icon;
                return (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#0f6b4f]/30 hover:shadow-md"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f6b4f]/10">
                      <Icon className="h-5 w-5 text-[#0f6b4f]" />
                    </div>
                    <h3 className="font-semibold text-gray-900">{card.label}</h3>
                    <p className="mt-1 text-sm text-gray-500">{card.desc}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
