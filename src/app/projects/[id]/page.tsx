"use client";

import { use } from "react";
import Link from "next/link";
import { FolderOpen, MapPin, Calendar, Plus, MoreHorizontal } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-yellow-100 text-yellow-800 border-yellow-200",
  unsent: "bg-gray-100 text-gray-600 border-gray-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db } = useDb();

  const project = db.projects.find((p) => p.id === id);
  const quotes = db.quotes.filter((q) => q.projectId === id);

  if (!project) {
    return (
      <div className="p-8 text-gray-400">
        Project not found. <Link href="/projects" className="text-[#0f6b4f] underline">Back to projects</Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/projects" className="hover:text-gray-900">Projects</Link>
        <span>›</span>
        <span className="text-gray-900">{project.name}</span>
      </div>

      {/* Project header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100">
          <FolderOpen className="h-7 w-7 text-gray-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
            <button className="text-gray-400 hover:text-gray-600">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <span className="text-gray-400">📋</span>
              {quotes.length} quote{quotes.length !== 1 ? "s" : ""}
            </span>
            {project.address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {project.address}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Created {formatDate(project.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="quotes">
        <TabsList className="border-b border-gray-200 bg-transparent p-0 h-auto mb-6">
          <TabsTrigger
            value="quotes"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-0 text-sm data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Quotes
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="rounded-none border-b-2 border-transparent px-4 pb-3 pt-0 text-sm data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quotes">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Quotes</h2>
            <Button size="sm" className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white gap-1">
              <Plus className="h-4 w-4" /> New Quote
            </Button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-medium">No.</th>
                  <th className="px-4 py-3 text-left font-medium">Job Name</th>
                  <th className="px-4 py-3 text-left font-medium">Contractor</th>
                  <th className="px-4 py-3 text-left font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {quotes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No quotes yet — create one above.
                    </td>
                  </tr>
                )}
                {quotes.map((quote) => {
                  const routeTotal = quote.routes.reduce((sum, r) => sum + r.haulCost + r.materialCost, 0);
                  const taxable = quote.routes.filter(r => r.taxable).reduce((sum, r) => sum + r.haulCost + r.materialCost, 0);
                  const tax = taxable * (quote.taxRate / 100);
                  const total = routeTotal + tax;
                  return (
                    <tr key={quote.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/quotes/${quote.id}`} className="font-mono text-xs text-gray-500 hover:text-[#0f6b4f]">
                          {quote.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link href={`/quotes/${quote.id}`} className="hover:text-[#0f6b4f]">
                          {quote.jobName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{quote.contractorName || "—"}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(total)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[quote.status]}`}>
                          {quote.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(quote.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">
            Orders coming soon.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
