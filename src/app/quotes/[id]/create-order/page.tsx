"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ShoppingCart } from "lucide-react";
import { useDb } from "@/components/DbProvider";
import { formatCurrency } from "@/lib/utils";
import {
  createOrderFromSelections,
  routeDisplayLabel,
  selectionsTotalWithTax,
  wizardItemsForRoutes,
  type OrderLineSelection,
} from "@/lib/orders";
import { getRouteMaterials, normalizeRouteMaterials } from "@/lib/route-materials";
import { resolveCurrentUser } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unitRateLabel, type MaterialPriceUnit } from "@/lib/types";

type WizardStep = 1 | 2 | 3;

interface ItemConfig {
  selected: boolean;
  qty: number;
}

function itemKey(quoteRouteId: string, materialLineId?: string) {
  return materialLineId ? `${quoteRouteId}:${materialLineId}` : quoteRouteId;
}

export default function CreateOrderFromQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { db, save } = useDb();
  const router = useRouter();
  const user = resolveCurrentUser(db);

  const quote = db.quotes.find((q) => q.id === id);
  const project = quote ? db.projects.find((p) => p.id === quote.projectId) : null;

  const [step, setStep] = useState<WizardStep>(1);
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);
  const [itemConfig, setItemConfig] = useState<Record<string, ItemConfig>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wizardItems = useMemo(() => {
    if (!quote) return [];
    return wizardItemsForRoutes(db, quote, selectedRouteIds);
  }, [db, quote, selectedRouteIds]);

  const selections: OrderLineSelection[] = useMemo(() => {
    return wizardItems
      .filter((item) => {
        const cfg = itemConfig[itemKey(item.quoteRouteId, item.materialLineId)];
        return cfg?.selected && cfg.qty > 0;
      })
      .map((item) => ({
        quoteRouteId: item.quoteRouteId,
        materialLineId: item.materialLineId,
        qty: itemConfig[itemKey(item.quoteRouteId, item.materialLineId)]!.qty,
      }));
  }, [wizardItems, itemConfig]);

  const totals = quote ? selectionsTotalWithTax(quote, selections) : { subtotal: 0, tax: 0, total: 0 };

  if (!quote) {
    return (
      <div className="p-8 text-gray-400">
        Quote not found.{" "}
        <Link href="/quotes" className="text-[#0f6b4f] underline">
          Back to quotes
        </Link>
      </div>
    );
  }

  if (quote.status !== "approved") {
    return (
      <div className="p-8">
        <p className="text-gray-600">Only approved quotes can be turned into orders.</p>
        <Link href={`/quotes/${id}`} className="mt-2 inline-block text-[#0f6b4f] underline">
          Back to quote
        </Link>
      </div>
    );
  }

  function toggleRoute(routeId: string) {
    setSelectedRouteIds((prev) =>
      prev.includes(routeId) ? prev.filter((r) => r !== routeId) : [...prev, routeId]
    );
  }

  function selectAllRoutes() {
    setSelectedRouteIds(quote!.routes.map((r) => r.id));
  }

  function deselectAllRoutes() {
    setSelectedRouteIds([]);
  }

  function initItemConfigForStep2() {
    const items = wizardItemsForRoutes(db, quote!, selectedRouteIds);
    const next: Record<string, ItemConfig> = { ...itemConfig };
    for (const item of items) {
      const key = itemKey(item.quoteRouteId, item.materialLineId);
      if (!next[key]) {
        const remaining = Math.max(0, item.defaultQty - item.orderedQty);
        next[key] = { selected: true, qty: remaining > 0 ? remaining : item.defaultQty };
      }
    }
    setItemConfig(next);
  }

  function continueFromRoutes() {
    if (selectedRouteIds.length === 0) {
      setError("Select at least one route.");
      return;
    }
    setError(null);
    initItemConfigForStep2();
    setStep(2);
  }

  function continueFromItems() {
    if (selections.length === 0) {
      setError("Select at least one material with a quantity greater than zero.");
      return;
    }
    setError(null);
    setStep(3);
  }

  async function handleCreate() {
    if (selections.length === 0 || !quote) return;
    setSubmitting(true);
    setError(null);
    try {
      const { db: next, order } = createOrderFromSelections(db, quote.id, selections, {
        createdByUserId: user?.id,
        notes: notes.trim() || undefined,
      });
      await save(next);
      router.push(`/orders/${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create order");
    } finally {
      setSubmitting(false);
    }
  }

  const routeIndexById = Object.fromEntries(quote.routes.map((r, i) => [r.id, i]));

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/quotes" className="hover:text-gray-900">
            Quotes
          </Link>
          <span>›</span>
          <Link href={`/quotes/${id}`} className="hover:text-gray-900">
            {project?.name || quote.jobName}
          </Link>
          <span>›</span>
          <span className="text-gray-900">Create Order</span>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Create Order</h1>
            <p className="text-sm text-gray-500">
              {quote.jobName} ({quote.number})
            </p>
          </div>
        </div>

        {/* Step 1: Routes */}
        <section className="mb-4 rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <StepBadge done={step > 1} n={1} />
              <div>
                <h2 className="font-semibold text-gray-900">Select Routes</h2>
                {step > 1 && (
                  <p className="text-sm text-gray-500">
                    {selectedRouteIds.length} route{selectedRouteIds.length !== 1 ? "s" : ""} selected
                  </p>
                )}
              </div>
            </div>
            {step > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                Edit
              </Button>
            )}
          </div>
          {step === 1 && (
            <div className="px-6 py-4">
              <div className="mb-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllRoutes}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAllRoutes}>
                  Deselect All
                </Button>
              </div>
              <div className="space-y-3">
                {quote.routes.map((route, i) => (
                  <label
                    key={route.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 p-4 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedRouteIds.includes(route.id)}
                      onChange={() => toggleRoute(route.id)}
                    />
                    <div>
                      <p className="font-medium text-gray-900">
                        {routeDisplayLabel(db, route, i)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
              {error && step === 1 && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <Button
                className="mt-6 bg-[#0f6b4f] hover:bg-[#0d5a42]"
                onClick={continueFromRoutes}
              >
                Continue
              </Button>
            </div>
          )}
        </section>

        {/* Step 2: Items */}
        <section
          className={`mb-4 rounded-xl border bg-white ${step < 2 ? "border-gray-100 opacity-60" : "border-gray-200"}`}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <StepBadge done={step > 2} n={2} />
              <div>
                <h2 className="font-semibold text-gray-900">Configure Items</h2>
                {step > 2 && selections.length > 0 && (
                  <p className="text-sm text-gray-500">
                    {selections.length} item{selections.length !== 1 ? "s" : ""} configured
                  </p>
                )}
              </div>
            </div>
            {step > 2 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                Edit
              </Button>
            )}
          </div>
          {step === 2 && (
            <div className="px-6 py-4">
              {selectedRouteIds.map((routeId) => {
                const route = quote.routes.find((r) => r.id === routeId)!;
                const routeIdx = routeIndexById[routeId] ?? 0;
                const routeItems = wizardItems.filter((w) => w.quoteRouteId === routeId);
                const materials = getRouteMaterials(normalizeRouteMaterials(route));
                return (
                  <div key={routeId} className="mb-6 last:mb-0">
                    <p className="mb-3 text-sm font-medium text-gray-700">
                      {routeDisplayLabel(db, route, routeIdx)}
                    </p>
                    <div className="space-y-3">
                      {routeItems.map((item) => {
                        const key = itemKey(item.quoteRouteId, item.materialLineId);
                        const cfg = itemConfig[key] ?? { selected: false, qty: item.defaultQty };
                        const mat = item.materialLineId
                          ? materials.find((m) => m.id === item.materialLineId)
                          : undefined;
                        const remaining = Math.max(0, item.defaultQty - item.orderedQty);
                        return (
                          <div
                            key={key}
                            className="rounded-lg border border-gray-100 p-4"
                          >
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={cfg.selected}
                                onChange={(e) =>
                                  setItemConfig((prev) => ({
                                    ...prev,
                                    [key]: { ...cfg, selected: e.target.checked },
                                  }))
                                }
                              />
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">
                                  {mat
                                    ? `hauling + ${item.label}`
                                    : item.label}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
                                  <span>
                                    HAULING: hauling {formatCurrency(item.haulSellRate)}/
                                    {item.unit.toLowerCase()}
                                  </span>
                                  {mat && (
                                    <span>
                                      MATERIAL: {item.label}{" "}
                                      {formatCurrency(item.materialSellRate)}/
                                      {item.unit.toLowerCase()}
                                    </span>
                                  )}
                                </div>
                                {item.orderedQty > 0 && (
                                  <p className="mt-1 text-xs text-amber-700">
                                    {item.orderedQty} {unitRateLabel(item.unit as MaterialPriceUnit)} already on other
                                    orders · {remaining} remaining on quote
                                  </p>
                                )}
                              </div>
                            </label>
                            {cfg.selected && (
                              <div className="mt-3 flex items-center gap-2 pl-7">
                                <span className="text-sm text-gray-500">Quantity</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.5"
                                  className="h-9 w-28"
                                  value={cfg.qty}
                                  onChange={(e) =>
                                    setItemConfig((prev) => ({
                                      ...prev,
                                      [key]: {
                                        ...cfg,
                                        qty: parseFloat(e.target.value) || 0,
                                      },
                                    }))
                                  }
                                />
                                <span className="text-sm text-gray-500">
                                  {item.unit.toLowerCase()}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {error && step === 2 && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <Button
                className="mt-6 bg-[#0f6b4f] hover:bg-[#0d5a42]"
                onClick={continueFromItems}
              >
                Continue
              </Button>
            </div>
          )}
        </section>

        {/* Step 3: Review */}
        <section
          className={`mb-4 rounded-xl border bg-white ${step < 3 ? "border-gray-100 opacity-60" : "border-gray-200"}`}
        >
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <StepBadge done={false} n={3} active={step === 3} />
              <h2 className="font-semibold text-gray-900">Review &amp; Confirm</h2>
            </div>
          </div>
          {step === 3 && (
            <div className="px-6 py-4">
              <p className="mb-4 text-sm text-gray-600">
                Each selected route and material becomes its own order line — dispatch one material
                per truck.
              </p>
              <ul className="mb-6 space-y-2 text-sm">
                {selections.map((sel) => {
                  const route = quote.routes.find((r) => r.id === sel.quoteRouteId)!;
                  const routeIdx = routeIndexById[sel.quoteRouteId] ?? 0;
                  const materials = getRouteMaterials(normalizeRouteMaterials(route));
                  const mat = sel.materialLineId
                    ? materials.find((m) => m.id === sel.materialLineId)
                    : undefined;
                  return (
                    <li
                      key={itemKey(sel.quoteRouteId, sel.materialLineId)}
                      className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <span>
                        Route {routeIdx + 1}
                        {mat ? ` · ${mat.materialName}` : " · Hauling"} — {sel.qty}{" "}
                        {unitRateLabel(mat?.materialUnit ?? route.haulUnit ?? "TN")}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
              <Button
                className="gap-1.5 bg-[#0f6b4f] hover:bg-[#0d5a42]"
                disabled={submitting}
                onClick={handleCreate}
              >
                <ShoppingCart className="h-4 w-4" />
                {submitting ? "Creating…" : "Create Order"}
              </Button>
            </div>
          )}
        </section>
      </div>

      <aside className="w-[300px] shrink-0 border-l border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Order Summary</h2>
        <div className="space-y-2 text-sm">
          {selections.map((sel) => {
            const route = quote.routes.find((r) => r.id === sel.quoteRouteId)!;
            const routeIdx = routeIndexById[sel.quoteRouteId] ?? 0;
            const materials = getRouteMaterials(normalizeRouteMaterials(route));
            const mat = sel.materialLineId
              ? materials.find((m) => m.id === sel.materialLineId)
              : undefined;
            const lineTotal =
              (route.haulRate ?? 0) * sel.qty +
              (mat ? mat.materialCost * sel.qty : 0);
            return (
              <div key={itemKey(sel.quoteRouteId, sel.materialLineId)} className="flex justify-between">
                <span className="text-gray-500">
                  Route #{routeIdx + 1}
                  {mat ? ` · ${mat.materialName}` : ""}
                </span>
                <span className="font-medium">{formatCurrency(lineTotal)}</span>
              </div>
            );
          })}
        </div>
        <div className="my-4 border-t border-gray-100" />
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{formatCurrency(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Tax ({quote.taxRate}%)</span>
            <span>{formatCurrency(totals.tax)}</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900">
            <span>Total</span>
            <span>{formatCurrency(totals.total)}</span>
          </div>
        </div>

        <h2 className="mb-2 mt-8 text-base font-semibold text-gray-900">Notes</h2>
        <textarea
          className="min-h-[80px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          placeholder="Optional notes for this order…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </aside>
    </div>
  );
}

function StepBadge({
  n,
  done,
  active,
}: {
  n: number;
  done?: boolean;
  active?: boolean;
}) {
  if (done) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0f6b4f] text-white">
        <Check className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
        active ? "bg-[#0f6b4f] text-white" : "bg-gray-100 text-gray-600"
      }`}
    >
      {n}
    </div>
  );
}
