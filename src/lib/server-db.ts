import { promises as fs } from "fs";
import path from "path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  Db,
  Quote,
  QuoteRoute,
  Material,
  DbMeta,
  normalizeMaterialUnit,
  RouteMaterialLine,
  Activity,
  ProjectStage,
  Order,
  OrderLine,
  Dispatch,
  DeliveryTicket,
  CustomerInvoice,
  CarrierSettlement,
  VendorSettlement,
  Trip,
  PaymentRecord,
} from "./types";
import { EMPTY_DB, normalizeMeta, seedOffices } from "./db-defaults";
import { normalizeFullDb } from "./normalize-db";
import { normalizeHaulRate } from "./haul-pricing";
import type { LegacyHaulRate } from "./types";
import { normalizeRouteMaterials, syncRouteLegacyMaterial } from "./route-materials";
import { parseHaulRatesTxt } from "./haul-rates-seed";

const DATA_FILE = path.join(process.cwd(), ".data", "petrafi-db.json");

function parseJson<T>(raw: unknown): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return undefined;
  }
}
const BUNDLED_HAUL_FILE = path.join(process.cwd(), "data", "haul-rates-per-mile.txt");

/** Parse a JSON array of photo data URLs stored in the materials.photos column. */
function parsePhotos(raw: unknown): string[] | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return arr.map(String);
  } catch {
    /* ignore malformed */
  }
  return undefined;
}

function parseVendorDocuments(raw: unknown): import("./types").VendorDocument[] | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return arr as import("./types").VendorDocument[];
  } catch {
    /* ignore malformed */
  }
  return undefined;
}

type D1Database = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      all: () => Promise<{ results: Record<string, unknown>[] }>;
      run: () => Promise<unknown>;
    };
    all: () => Promise<{ results: Record<string, unknown>[] }>;
    run: () => Promise<unknown>;
  };
  batch: (stmts: { sql: string; args?: unknown[] }[]) => Promise<unknown>;
};

export function getD1(): D1Database | null {
  // On Cloudflare Workers, the D1 binding is an object exposed via OpenNext's
  // request context (not process.env). Fall back to process.env for local dev.
  try {
    const env = getCloudflareContext().env as unknown as { DB?: D1Database };
    if (env?.DB) return env.DB;
  } catch {
    /* not running in the Workers runtime */
  }
  const penv = process.env as unknown as { DB?: D1Database };
  return penv.DB ?? null;
}

async function loadBundledHaulRatesIfNeeded(db: Db): Promise<Db> {
  if (db.haulRates.length > 0) return db;
  try {
    const raw = await fs.readFile(BUNDLED_HAUL_FILE, "utf-8");
    const haulRates = parseHaulRatesTxt(raw);
    if (haulRates.length > 0) return { ...db, haulRates };
  } catch {
    /* bundled file optional */
  }
  return db;
}

async function loadFromFile(): Promise<Db> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return loadBundledHaulRatesIfNeeded(normalizeFullDb(JSON.parse(raw)));
  } catch {
    return loadBundledHaulRatesIfNeeded({ ...EMPTY_DB, offices: seedOffices() });
  }
}

async function saveToFile(db: Db): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
}

async function loadMeta(d1: D1Database): Promise<DbMeta> {
  const rows = (await d1.prepare("SELECT key, value FROM app_meta").all()).results;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return normalizeMeta({
    quoteCounter: parseInt(String(map.quote_counter ?? "0"), 10) || 0,
    orderCounter: parseInt(String(map.order_counter ?? "0"), 10) || 0,
    invoiceCounter: parseInt(String(map.invoice_counter ?? "0"), 10) || 0,
    settlementCounter: parseInt(String(map.settlement_counter ?? "0"), 10) || 0,
    vendorSettlementCounter: parseInt(String(map.vendor_settlement_counter ?? "0"), 10) || 0,
    tripCounter: parseInt(String(map.trip_counter ?? "0"), 10) || 0,
    ticketCounter: parseInt(String(map.ticket_counter ?? "0"), 10) || 0,
    defaultTaxRate: parseFloat(String(map.default_tax_rate ?? "7")),
    haulBrokerFeePercent: parseFloat(String(map.haul_broker_fee_percent ?? "10")),
    haulSellMarginPercent: parseFloat(String(map.haul_sell_margin_percent ?? "15")),
    orgName: String(map.org_name ?? "AT of Palm Beach"),
    orgCode: String(map.org_code ?? "ATPB"),
    currentUserId: map.current_user_id ? String(map.current_user_id) : undefined,
    haulRateAdjustmentPercent: map.haul_rate_adjustment_percent
      ? parseFloat(String(map.haul_rate_adjustment_percent))
      : undefined,
  });
}

async function saveMeta(d1: D1Database, meta: DbMeta): Promise<void> {
  const pairs: [string, string][] = [
    ["quote_counter", String(meta.quoteCounter)],
    ["order_counter", String(meta.orderCounter ?? 0)],
    ["invoice_counter", String(meta.invoiceCounter ?? 0)],
    ["settlement_counter", String(meta.settlementCounter ?? 0)],
    ["vendor_settlement_counter", String(meta.vendorSettlementCounter ?? 0)],
    ["trip_counter", String(meta.tripCounter ?? 0)],
    ["ticket_counter", String(meta.ticketCounter ?? 0)],
    ["default_tax_rate", String(meta.defaultTaxRate ?? 7)],
    ["haul_broker_fee_percent", String(meta.haulBrokerFeePercent ?? 10)],
    ["haul_sell_margin_percent", String(meta.haulSellMarginPercent ?? 15)],
    ["org_name", meta.orgName ?? ""],
    ["org_code", meta.orgCode ?? ""],
    ["current_user_id", meta.currentUserId ?? ""],
    ["haul_rate_adjustment_percent", String(meta.haulRateAdjustmentPercent ?? "")],
  ];
  for (const [key, value] of pairs) {
    await d1
      .prepare(
        "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .bind(key, value)
      .run();
  }
}

async function loadFromD1(d1: D1Database): Promise<Db> {
  const [
    projects,
    contractors,
    vendors,
    materials,
    haulRates,
    quotes,
    routes,
    meta,
    officesResult,
    usersResult,
  ] = await Promise.all([
    d1.prepare("SELECT * FROM projects").all(),
    d1.prepare("SELECT * FROM contractors").all(),
    d1.prepare("SELECT * FROM vendors").all(),
    d1.prepare("SELECT * FROM materials").all(),
    d1.prepare("SELECT * FROM haul_rates ORDER BY COALESCE(miles, min_miles)").all(),
    d1.prepare("SELECT * FROM quotes ORDER BY created_at DESC").all(),
    d1.prepare("SELECT * FROM quote_routes ORDER BY sort_order").all(),
    loadMeta(d1),
    d1.prepare("SELECT * FROM offices").all().catch(() => ({ results: [] as Record<string, unknown>[] })),
    d1.prepare("SELECT * FROM users").all().catch(() => ({ results: [] as Record<string, unknown>[] })),
  ]);

  const routesByQuote = new Map<string, QuoteRoute[]>();
  for (const row of routes.results) {
    const quoteId = String(row.quote_id);
    const list = routesByQuote.get(quoteId) ?? [];
    let materialLines: RouteMaterialLine[] | undefined;
    if (row.material_lines) {
      try {
        materialLines = JSON.parse(String(row.material_lines)) as RouteMaterialLine[];
      } catch {
        materialLines = undefined;
      }
    }
    list.push(
      normalizeRouteMaterials({
        id: String(row.id),
        quoteId,
        sortOrder: Number(row.sort_order) || 0,
        pickupAddress: String(row.pickup_address ?? ""),
        dropoffAddress: String(row.dropoff_address ?? ""),
        pickupVendorId: row.pickup_vendor_id ? String(row.pickup_vendor_id) : undefined,
        dropoffVendorId: row.dropoff_vendor_id ? String(row.dropoff_vendor_id) : undefined,
        disposalCost: row.disposal_cost != null ? Number(row.disposal_cost) : undefined,
        disposalRate: row.disposal_rate != null ? Number(row.disposal_rate) : undefined,
        haulRate: Number(row.haul_rate) || 0,
        haulCost: Number(row.haul_cost) || 0,
        haulQty: Number(row.haul_qty) || 0,
        haulUnit: normalizeMaterialUnit(row.haul_unit as string | undefined),
        haulMiles: row.haul_miles != null ? Number(row.haul_miles) : undefined,
        haulRatePerLoad:
          row.haul_rate_per_load != null ? Number(row.haul_rate_per_load) : undefined,
        materialId: row.material_id ? String(row.material_id) : undefined,
        materialName: String(row.material_name ?? ""),
        materialType: String(row.material_type ?? ""),
        materialRate: Number(row.material_rate) || 0,
        materialCost: Number(row.material_cost) || 0,
        materialQty: Number(row.material_qty) || 0,
        materialUnit: normalizeMaterialUnit(row.material_unit as string | undefined),
        materialLines,
        taxable: Boolean(row.taxable),
      })
    );
    routesByQuote.set(quoteId, list);
  }

  const db: Db = {
    meta,
    projects: projects.results.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      address: String(r.address ?? ""),
      description: String(r.description ?? ""),
      createdAt: String(r.created_at),
      updatedAt: r.updated_at ? String(r.updated_at) : String(r.created_at),
      stage: (r.stage ? String(r.stage) : "new") as ProjectStage,
      archived: Boolean(r.archived),
      officeId: r.office_id ? String(r.office_id) : undefined,
      salespersonId: r.salesperson_id ? String(r.salesperson_id) : undefined,
      sourceCompany: r.source_company ? String(r.source_company) : undefined,
      sourceContractorId: r.source_contractor_id ? String(r.source_contractor_id) : undefined,
      intakeDueDate: r.intake_due_date ? String(r.intake_due_date) : undefined,
    })),
    contractors: contractors.results.map((r) => ({
      id: String(r.id),
      firstName: String(r.first_name),
      lastName: String(r.last_name ?? ""),
      company: String(r.company ?? ""),
      email: String(r.email ?? ""),
      phone: String(r.phone ?? ""),
      address: String(r.address ?? ""),
      ein: r.ein ? String(r.ein) : undefined,
      officeId: r.office_id ? String(r.office_id) : undefined,
      salespersonId: r.salesperson_id ? String(r.salesperson_id) : undefined,
      contactNotes: r.contact_notes ? String(r.contact_notes) : undefined,
    })),
    vendors: vendors.results.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      address: String(r.address ?? ""),
      lat: r.lat != null ? Number(r.lat) : undefined,
      lng: r.lng != null ? Number(r.lng) : undefined,
      type: (r.type === "disposal" ? "disposal" : "quarry") as "quarry" | "disposal",
      temporary: Number(r.temporary) === 1 ? true : undefined,
      contactName: r.contact_name ? String(r.contact_name) : undefined,
      contactEmail: r.contact_email ? String(r.contact_email) : undefined,
      contactPhone: r.contact_phone ? String(r.contact_phone) : undefined,
      paymentTermsDays:
        r.payment_terms_days != null ? Number(r.payment_terms_days) : undefined,
      taxId: r.tax_id ? String(r.tax_id) : undefined,
      w9OnFile: Number(r.w9_on_file) === 1 ? true : undefined,
      w9FileUrl: r.w9_file_url ? String(r.w9_file_url) : undefined,
      documents: parseVendorDocuments(r.documents_json),
    })),
    materials: materials.results.map((r) => ({
      id: String(r.id),
      vendorId: String(r.vendor_id ?? ""),
      name: String(r.name),
      type: String(r.type ?? ""),
      pricePerTon: Number(r.price_per_ton) || 0,
      priceUnit: (r.price_unit as Material["priceUnit"]) ?? "TN",
      rateExpiresOn: r.rate_expires_on ? String(r.rate_expires_on) : undefined,
      photos: parsePhotos(r.photos),
    })),
    haulRates: haulRates.results.map((r) =>
      normalizeHaulRate({
        id: String(r.id),
        miles: r.miles != null ? Number(r.miles) : undefined,
        ratePerLoad: r.rate_per_load != null ? Number(r.rate_per_load) : undefined,
        minMiles: Number(r.min_miles) || 0,
        ratePerTon: Number(r.rate_per_ton) || 0,
      } as LegacyHaulRate)
    ),
    offices:
      officesResult.results.length > 0
        ? officesResult.results.map((r) => ({
            id: String(r.id),
            code: String(r.code) as import("./types").OfficeCode,
            name: String(r.name),
          }))
        : seedOffices(),
    users: usersResult.results.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      email: r.email ? String(r.email) : undefined,
      role: (r.role === "admin" ? "admin" : "salesperson") as import("./types").UserRole,
      officeId: r.office_id ? String(r.office_id) : undefined,
    })),
    quotes: quotes.results.map((r) => {
      const id = String(r.id);
      let history: Quote["history"];
      try {
        history = r.history_json
          ? (JSON.parse(String(r.history_json)) as Quote["history"])
          : undefined;
      } catch {
        history = undefined;
      }
      return {
        id,
        projectId: String(r.project_id),
        number: String(r.number),
        jobName: String(r.job_name),
        contractorId: r.contractor_id ? String(r.contractor_id) : undefined,
        status: String(r.status) as Quote["status"],
        taxRate: Number(r.tax_rate) || 0,
        createdAt: String(r.created_at),
        sentAt: r.sent_at ? String(r.sent_at) : undefined,
        routes: routesByQuote.get(id) ?? [],
        history,
      };
    }),
    activities: [],
    emailIntakes: [],
    emailAttachments: [],
    projectBidders: [],
    carriers: [],
    orders: [],
    trips: [],
    dispatches: [],
    deliveryTickets: [],
    customerInvoices: [],
    carrierSettlements: [],
    vendorSettlements: [],
  };

  try {
    const activitiesResult = await d1.prepare("SELECT * FROM activities ORDER BY scheduled_at DESC").all();
    db.activities = activitiesResult.results.map((r) => ({
      id: String(r.id),
      type: String(r.type) as Activity["type"],
      status: String(r.status) as Activity["status"],
      subject: String(r.subject),
      notes: r.notes ? String(r.notes) : undefined,
      scheduledAt: String(r.scheduled_at),
      completedAt: r.completed_at ? String(r.completed_at) : undefined,
      projectId: r.project_id ? String(r.project_id) : undefined,
      contractorId: r.contractor_id ? String(r.contractor_id) : undefined,
      company: r.company ? String(r.company) : undefined,
      customerInvoiceId: r.customer_invoice_id ? String(r.customer_invoice_id) : undefined,
      carrierSettlementId: r.carrier_settlement_id ? String(r.carrier_settlement_id) : undefined,
      vendorSettlementId: r.vendor_settlement_id ? String(r.vendor_settlement_id) : undefined,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  } catch {
    // Table may not exist until migration 0007
  }

  try {
    const intakesResult = await d1.prepare("SELECT * FROM project_email_intakes").all();
    db.emailIntakes = intakesResult.results.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      company: String(r.company),
      contractorId: String(r.contractor_id),
      receivedAt: String(r.received_at),
      subject: String(r.subject),
      fromName: r.from_name ? String(r.from_name) : undefined,
      fromEmail: String(r.from_email),
      bodyText: String(r.body_text),
      bodyHtml: r.body_html ? String(r.body_html) : undefined,
      signatureText: r.signature_text ? String(r.signature_text) : undefined,
      isForwarded: Boolean(r.is_forwarded),
      attachmentIds: r.attachment_ids
        ? (JSON.parse(String(r.attachment_ids)) as string[])
        : [],
    }));
    const attResult = await d1.prepare("SELECT * FROM email_attachments").all();
    db.emailAttachments = attResult.results.map((r) => ({
      id: String(r.id),
      intakeId: String(r.intake_id),
      projectId: String(r.project_id),
      fileName: String(r.file_name),
      mimeType: String(r.mime_type),
      size: Number(r.size) || 0,
      storageKey: String(r.storage_key),
      contentBase64: r.content_base64 ? String(r.content_base64) : undefined,
    }));
  } catch {
    /* tables from migration 0009 */
  }

  try {
    const biddersResult = await d1.prepare("SELECT * FROM project_bidders").all();
    db.projectBidders = biddersResult.results.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      company: String(r.company),
      contractorId: r.contractor_id ? String(r.contractor_id) : undefined,
      status: String(r.status) as import("./types").ProjectBidderStatus,
      notes: r.notes ? String(r.notes) : undefined,
      updatedAt: String(r.updated_at),
    }));
  } catch {
    /* migration 0011 */
  }

  try {
    const carriersResult = await d1.prepare("SELECT * FROM carriers").all();
    db.carriers = carriersResult.results.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      contactName: r.contact_name ? String(r.contact_name) : undefined,
      phone: String(r.phone ?? ""),
      email: String(r.email ?? ""),
      officeId: r.office_id ? String(r.office_id) : undefined,
      paymentTermsDays:
        r.payment_terms_days != null ? Number(r.payment_terms_days) : undefined,
      taxId: r.tax_id ? String(r.tax_id) : undefined,
      w9OnFile: Number(r.w9_on_file) === 1 ? true : undefined,
      w9FileUrl: r.w9_file_url ? String(r.w9_file_url) : undefined,
    }));

    const orderLinesResult = await d1.prepare("SELECT * FROM order_lines ORDER BY sort_order").all();
    const linesByOrder = new Map<string, OrderLine[]>();
    for (const row of orderLinesResult.results) {
      const orderId = String(row.order_id);
      let materialLines: RouteMaterialLine[] | undefined;
      if (row.material_lines) {
        try {
          materialLines = JSON.parse(String(row.material_lines)) as RouteMaterialLine[];
        } catch {
          materialLines = undefined;
        }
      }
      const list = linesByOrder.get(orderId) ?? [];
      list.push({
        id: String(row.id),
        orderId,
        sortOrder: Number(row.sort_order) || 0,
        quoteRouteId: row.quote_route_id ? String(row.quote_route_id) : undefined,
        pickupAddress: String(row.pickup_address ?? ""),
        dropoffAddress: String(row.dropoff_address ?? ""),
        pickupVendorId: row.pickup_vendor_id ? String(row.pickup_vendor_id) : undefined,
        dropoffVendorId: row.dropoff_vendor_id ? String(row.dropoff_vendor_id) : undefined,
        materialName: row.material_name ? String(row.material_name) : undefined,
        materialBuyRate: Number(row.material_buy_rate) || 0,
        materialSellRate: Number(row.material_sell_rate) || 0,
        materialUnit: normalizeMaterialUnit(row.material_unit as string | undefined),
        materialQtyQuoted: Number(row.material_qty_quoted) || 0,
        materialLines,
        disposalBuyRate: Number(row.disposal_buy_rate) || 0,
        disposalSellRate: Number(row.disposal_sell_rate) || 0,
        haulBuyRate: Number(row.haul_buy_rate) || 0,
        haulSellRate: Number(row.haul_sell_rate) || 0,
        haulUnit: normalizeMaterialUnit(row.haul_unit as string | undefined),
        haulQtyQuoted: Number(row.haul_qty_quoted) || 0,
        taxable: Boolean(row.taxable),
      });
      linesByOrder.set(orderId, list);
    }

    const ordersResult = await d1.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
    db.orders = ordersResult.results.map((r) => {
      const id = String(r.id);
      let history: Order["history"] = [];
      if (r.history_json) {
        try {
          history = JSON.parse(String(r.history_json)) as Order["history"];
        } catch {
          history = [];
        }
      }
      return {
        id,
        number: String(r.number),
        projectId: String(r.project_id),
        quoteId: String(r.quote_id),
        contractorId: r.contractor_id ? String(r.contractor_id) : undefined,
        jobName: String(r.job_name),
        taxRate: Number(r.tax_rate) || 0,
        status: String(r.status) as Order["status"],
        lines: linesByOrder.get(id) ?? [],
        createdAt: String(r.created_at),
        officeId: r.office_id ? String(r.office_id) : undefined,
        scheduledAt: r.scheduled_at ? String(r.scheduled_at) : undefined,
        createdByUserId: r.created_by_user_id ? String(r.created_by_user_id) : undefined,
        salespersonId: r.salesperson_id ? String(r.salesperson_id) : undefined,
        taxExempt: Boolean(r.tax_exempt),
        taxExemptNumber: r.tax_exempt_number ? String(r.tax_exempt_number) : undefined,
        history,
      };
    });

    try {
      const tripsResult = await d1.prepare("SELECT * FROM trips").all();
      db.trips = tripsResult.results.map((r) => ({
        id: String(r.id),
        number: String(r.number),
        orderId: String(r.order_id),
        dispatchId: String(r.dispatch_id),
        carrierId: String(r.carrier_id),
        truckLabel: r.truck_label ? String(r.truck_label) : undefined,
        driverName: r.driver_name ? String(r.driver_name) : undefined,
        status: String(r.status) as Trip["status"],
        scheduledDate: r.scheduled_date ? String(r.scheduled_date) : undefined,
        createdAt: String(r.created_at),
      }));
    } catch {
      db.trips = [];
    }

    const dispatchesResult = await d1.prepare("SELECT * FROM dispatches").all();
    db.dispatches = dispatchesResult.results.map((r) => ({
      id: String(r.id),
      orderId: String(r.order_id),
      orderLineId: String(r.order_line_id),
      carrierId: String(r.carrier_id),
      status: String(r.status) as Dispatch["status"],
      assignedAt: String(r.assigned_at),
      notes: r.notes ? String(r.notes) : undefined,
      tripId: r.trip_id ? String(r.trip_id) : undefined,
      truckLabel: r.truck_label ? String(r.truck_label) : undefined,
      scheduledDate: r.scheduled_date ? String(r.scheduled_date) : undefined,
    }));

    const ticketsResult = await d1.prepare("SELECT * FROM delivery_tickets").all();
    db.deliveryTickets = ticketsResult.results.map((r) => ({
      id: String(r.id),
      dispatchId: String(r.dispatch_id),
      orderId: String(r.order_id),
      orderLineId: String(r.order_line_id),
      lineType: String(r.line_type) as DeliveryTicket["lineType"],
      materialLineId: r.material_line_id ? String(r.material_line_id) : undefined,
      number: r.number ? String(r.number) : undefined,
      ticketNumber: r.ticket_number ? String(r.ticket_number) : undefined,
      paperTicketNumber: r.paper_ticket_number
        ? String(r.paper_ticket_number)
        : r.ticket_number
          ? String(r.ticket_number)
          : undefined,
      tripId: r.trip_id ? String(r.trip_id) : undefined,
      qty: Number(r.qty) || 0,
      unit: normalizeMaterialUnit(r.unit as string | undefined),
      deliveredAt: String(r.delivered_at),
      status: String(r.status) as DeliveryTicket["status"],
      ticketImageUrl: r.ticket_image_url ? String(r.ticket_image_url) : undefined,
      rejectedAt: r.rejected_at ? String(r.rejected_at) : undefined,
      approvedByUserId: r.approved_by_user_id ? String(r.approved_by_user_id) : undefined,
      driverSellRate: r.driver_sell_rate != null ? Number(r.driver_sell_rate) : undefined,
      notes: r.notes ? String(r.notes) : undefined,
    }));

    const invoicesResult = await d1.prepare("SELECT * FROM customer_invoices ORDER BY issued_at DESC").all();
    db.customerInvoices = invoicesResult.results.map((r) => {
      let lines: CustomerInvoice["lines"] = [];
      let notes: CustomerInvoice["notes"];
      try {
        lines = r.lines_json ? (JSON.parse(String(r.lines_json)) as CustomerInvoice["lines"]) : [];
      } catch {
        lines = [];
      }
      try {
        notes = r.notes_json
          ? (JSON.parse(String(r.notes_json)) as CustomerInvoice["notes"])
          : undefined;
      } catch {
        notes = undefined;
      }
      return {
        id: String(r.id),
        number: String(r.number),
        orderId: r.order_id ? String(r.order_id) : undefined,
        projectId: r.project_id ? String(r.project_id) : undefined,
        contractorId: r.contractor_id ? String(r.contractor_id) : undefined,
        status: String(r.status) as CustomerInvoice["status"],
        subtotal: Number(r.subtotal) || 0,
        tax: Number(r.tax) || 0,
        total: Number(r.total) || 0,
        issuedAt: String(r.issued_at),
        dueDate: r.due_date ? String(r.due_date) : undefined,
        lines,
        notes,
        payments: parseJson<PaymentRecord[]>(r.payments_json),
        sentByUserId: r.sent_by_user_id ? String(r.sent_by_user_id) : undefined,
        sentAt: r.sent_at ? String(r.sent_at) : undefined,
        attachmentUrl: r.attachment_url ? String(r.attachment_url) : undefined,
        source: r.source ? (String(r.source) as CustomerInvoice["source"]) : undefined,
      };
    });

    const settlementsResult = await d1.prepare("SELECT * FROM carrier_settlements ORDER BY issued_at DESC").all();
    db.carrierSettlements = settlementsResult.results.map((r) => {
      let lines: CarrierSettlement["lines"] = [];
      let notes: CarrierSettlement["notes"];
      try {
        lines = r.lines_json ? (JSON.parse(String(r.lines_json)) as CarrierSettlement["lines"]) : [];
      } catch {
        lines = [];
      }
      try {
        notes = r.notes_json
          ? (JSON.parse(String(r.notes_json)) as CarrierSettlement["notes"])
          : undefined;
      } catch {
        notes = undefined;
      }
      return {
        id: String(r.id),
        number: String(r.number),
        orderId: String(r.order_id),
        carrierId: String(r.carrier_id),
        status: String(r.status) as CarrierSettlement["status"],
        subtotal: Number(r.subtotal) || 0,
        brokerFee: Number(r.broker_fee) || 0,
        netPay: Number(r.net_pay) || 0,
        issuedAt: String(r.issued_at),
        dueDate: r.due_date ? String(r.due_date) : undefined,
        lines,
        notes,
        payments: parseJson<PaymentRecord[]>(r.payments_json),
        approvedByUserId: r.approved_by_user_id ? String(r.approved_by_user_id) : undefined,
        approvedAt: r.approved_at ? String(r.approved_at) : undefined,
      };
    });

    const vendorSettlementsResult = await d1
      .prepare("SELECT * FROM vendor_settlements ORDER BY issued_at DESC")
      .all();
    db.vendorSettlements = vendorSettlementsResult.results.map((r) => {
      let lines: VendorSettlement["lines"] = [];
      let notes: VendorSettlement["notes"];
      let dispute: VendorSettlement["dispute"];
      try {
        lines = r.lines_json ? (JSON.parse(String(r.lines_json)) as VendorSettlement["lines"]) : [];
      } catch {
        lines = [];
      }
      try {
        notes = r.notes_json
          ? (JSON.parse(String(r.notes_json)) as VendorSettlement["notes"])
          : undefined;
      } catch {
        notes = undefined;
      }
      try {
        dispute = r.dispute_json
          ? (JSON.parse(String(r.dispute_json)) as VendorSettlement["dispute"])
          : undefined;
      } catch {
        dispute = undefined;
      }
      return {
        id: String(r.id),
        number: String(r.number),
        orderId: r.order_id ? String(r.order_id) : undefined,
        vendorId: String(r.vendor_id),
        payeeKind: String(r.payee_kind) as VendorSettlement["payeeKind"],
        status: String(r.status) as VendorSettlement["status"],
        subtotal: Number(r.subtotal) || 0,
        netPay: Number(r.net_pay) || 0,
        issuedAt: String(r.issued_at),
        dueDate: r.due_date ? String(r.due_date) : undefined,
        vendorInvoiceNumber: r.vendor_invoice_number
          ? String(r.vendor_invoice_number)
          : undefined,
        vendorInvoiceDate: r.vendor_invoice_date
          ? String(r.vendor_invoice_date)
          : undefined,
        lines,
        notes,
        dispute,
        payments: parseJson<PaymentRecord[]>(r.payments_json),
        approvedByUserId: r.approved_by_user_id ? String(r.approved_by_user_id) : undefined,
        approvedAt: r.approved_at ? String(r.approved_at) : undefined,
        source: r.source ? (String(r.source) as VendorSettlement["source"]) : undefined,
      };
    });
  } catch {
    /* migration 0016 / 0017 */
  }

  return normalizeFullDb(db);
}

async function saveToD1(d1: D1Database, db: Db): Promise<void> {
  const normalized = normalizeFullDb(db);
  try {
    await d1.prepare("DELETE FROM activities").run();
  } catch {
    /* optional table */
  }
  try {
    await d1.prepare("DELETE FROM users").run();
    await d1.prepare("DELETE FROM offices").run();
  } catch {
    /* tables may not exist */
  }
  await d1.prepare("DELETE FROM quote_routes").run();
  await d1.prepare("DELETE FROM quotes").run();
  await d1.prepare("DELETE FROM materials").run();
  await d1.prepare("DELETE FROM haul_rates").run();
  await d1.prepare("DELETE FROM vendors").run();
  await d1.prepare("DELETE FROM contractors").run();
  await d1.prepare("DELETE FROM projects").run();

  for (const o of normalized.offices) {
    try {
      await d1
        .prepare("INSERT INTO offices (id, code, name) VALUES (?, ?, ?)")
        .bind(o.id, o.code, o.name)
        .run();
    } catch {
      break;
    }
  }
  for (const u of normalized.users) {
    try {
      await d1
        .prepare(
          "INSERT INTO users (id, name, email, role, office_id) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(u.id, u.name, u.email ?? "", u.role, u.officeId ?? null)
        .run();
    } catch {
      break;
    }
  }
  for (const p of normalized.projects) {
    await d1
      .prepare(
        `INSERT INTO projects (id, name, address, description, created_at, stage, archived, office_id, salesperson_id, updated_at, source_company, source_contractor_id, intake_due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        p.id,
        p.name,
        p.address,
        p.description,
        p.createdAt,
        p.stage ?? "new",
        p.archived ? 1 : 0,
        p.officeId ?? null,
        p.salespersonId ?? null,
        p.updatedAt ?? p.createdAt,
        p.sourceCompany ?? null,
        p.sourceContractorId ?? null,
        p.intakeDueDate ?? null
      )
      .run();
  }
  for (const c of normalized.contractors) {
    await d1
      .prepare(
        `INSERT INTO contractors (id, first_name, last_name, company, email, phone, address, ein, office_id, salesperson_id, contact_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        c.id,
        c.firstName,
        c.lastName,
        c.company,
        c.email,
        c.phone,
        c.address,
        c.ein ?? "",
        c.officeId ?? null,
        c.salespersonId ?? null,
        c.contactNotes ?? ""
      )
      .run();
  }
  for (const v of normalized.vendors) {
    await d1
      .prepare(
        `INSERT INTO vendors (id, name, address, lat, lng, type, temporary, contact_name, contact_email,
         contact_phone, payment_terms_days, tax_id, w9_on_file, w9_file_url, documents_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        v.id,
        v.name,
        v.address,
        v.lat ?? null,
        v.lng ?? null,
        v.type,
        v.temporary ? 1 : 0,
        v.contactName ?? null,
        v.contactEmail ?? null,
        v.contactPhone ?? null,
        v.paymentTermsDays ?? null,
        v.taxId ?? null,
        v.w9OnFile ? 1 : 0,
        v.w9FileUrl ?? null,
        v.documents?.length ? JSON.stringify(v.documents) : null
      )
      .run();
  }
  for (const m of normalized.materials) {
    await d1
      .prepare(
        "INSERT INTO materials (id, vendor_id, name, type, price_per_ton, price_unit, photos, rate_expires_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        m.id,
        m.vendorId,
        m.name,
        m.type,
        m.pricePerTon,
        m.priceUnit ?? "TN",
        m.photos?.length ? JSON.stringify(m.photos) : null,
        m.rateExpiresOn ?? null
      )
      .run();
  }
  for (const h of normalized.haulRates) {
    await d1
      .prepare(
        `INSERT INTO haul_rates (id, zone_name, min_miles, max_miles, rate_per_ton, miles, rate_per_load)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        h.id,
        `Mile ${h.miles}`,
        h.miles,
        h.miles + 1,
        h.ratePerLoad / 21.5,
        h.miles,
        h.ratePerLoad
      )
      .run();
  }
  for (const q of normalized.quotes) {
    await d1
      .prepare(
        `INSERT INTO quotes (id, project_id, number, job_name, contractor_id, status, tax_rate, created_at, sent_at, history_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        q.id,
        q.projectId,
        q.number,
        q.jobName,
        q.contractorId ?? null,
        q.status,
        q.taxRate,
        q.createdAt,
        q.sentAt ?? null,
        JSON.stringify(q.history ?? [])
      )
      .run();
    for (const raw of q.routes) {
      const r = syncRouteLegacyMaterial(normalizeRouteMaterials(raw));
      await d1
        .prepare(
          `INSERT INTO quote_routes (id, quote_id, sort_order, pickup_address, dropoff_address,
           pickup_vendor_id, dropoff_vendor_id, disposal_cost, disposal_rate,
           haul_rate, haul_cost, haul_qty, haul_unit, haul_miles, haul_rate_per_load,
           material_id, material_name,
           material_type, material_rate, material_cost, material_qty, material_unit, material_lines, taxable)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          r.id,
          q.id,
          r.sortOrder,
          r.pickupAddress,
          r.dropoffAddress,
          r.pickupVendorId ?? null,
          r.dropoffVendorId ?? null,
          r.disposalCost ?? 0,
          r.disposalRate ?? 0,
          r.haulRate,
          r.haulCost,
          r.haulQty,
          r.haulUnit ?? "TN",
          r.haulMiles ?? null,
          r.haulRatePerLoad ?? null,
          r.materialId ?? null,
          r.materialName ?? "",
          r.materialType ?? "",
          r.materialRate,
          r.materialCost,
          r.materialQty,
          r.materialUnit ?? "TN",
          r.materialLines?.length ? JSON.stringify(r.materialLines) : null,
          r.taxable ? 1 : 0
        )
        .run();
    }
  }
  for (const a of normalized.activities) {
    try {
      await d1
        .prepare(
          `INSERT INTO activities (id, type, status, subject, notes, scheduled_at, completed_at,
           project_id, contractor_id, company, customer_invoice_id, carrier_settlement_id,
           vendor_settlement_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          a.id,
          a.type,
          a.status,
          a.subject,
          a.notes ?? null,
          a.scheduledAt,
          a.completedAt ?? null,
          a.projectId ?? null,
          a.contractorId ?? null,
          a.company ?? null,
          a.customerInvoiceId ?? null,
          a.carrierSettlementId ?? null,
          a.vendorSettlementId ?? null,
          a.createdAt,
          a.updatedAt
        )
        .run();
    } catch {
      break;
    }
  }
  try {
    await d1.prepare("DELETE FROM email_attachments").run();
    await d1.prepare("DELETE FROM project_email_intakes").run();
    for (const i of normalized.emailIntakes) {
      await d1
        .prepare(
          `INSERT INTO project_email_intakes (id, project_id, company, contractor_id, received_at, subject, from_name, from_email, body_text, body_html, signature_text, is_forwarded, attachment_ids)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          i.id,
          i.projectId,
          i.company,
          i.contractorId,
          i.receivedAt,
          i.subject,
          i.fromName ?? null,
          i.fromEmail,
          i.bodyText,
          i.bodyHtml ?? null,
          i.signatureText ?? null,
          i.isForwarded ? 1 : 0,
          JSON.stringify(i.attachmentIds)
        )
        .run();
    }
    for (const a of normalized.emailAttachments) {
      await d1
        .prepare(
          `INSERT INTO email_attachments (id, intake_id, project_id, file_name, mime_type, size, storage_key, content_base64)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          a.id,
          a.intakeId,
          a.projectId,
          a.fileName,
          a.mimeType,
          a.size,
          a.storageKey,
          a.contentBase64 ?? null
        )
        .run();
    }
  } catch {
    /* optional tables */
  }

  try {
    await d1.prepare("DELETE FROM project_bidders").run();
    for (const b of normalized.projectBidders) {
      await d1
        .prepare(
          `INSERT INTO project_bidders (id, project_id, company, contractor_id, status, notes, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          b.id,
          b.projectId,
          b.company,
          b.contractorId ?? null,
          b.status,
          b.notes ?? null,
          b.updatedAt
        )
        .run();
    }
  } catch {
    /* migration 0011 */
  }

  try {
    await d1.prepare("DELETE FROM vendor_settlements").run();
    await d1.prepare("DELETE FROM carrier_settlements").run();
    await d1.prepare("DELETE FROM customer_invoices").run();
    await d1.prepare("DELETE FROM delivery_tickets").run();
    await d1.prepare("DELETE FROM trips").run();
    await d1.prepare("DELETE FROM dispatches").run();
    await d1.prepare("DELETE FROM order_lines").run();
    await d1.prepare("DELETE FROM orders").run();
    await d1.prepare("DELETE FROM carriers").run();

    for (const c of normalized.carriers) {
      await d1
        .prepare(
          `INSERT INTO carriers (id, name, contact_name, phone, email, office_id, payment_terms_days,
           tax_id, w9_on_file, w9_file_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          c.id,
          c.name,
          c.contactName ?? null,
          c.phone,
          c.email,
          c.officeId ?? null,
          c.paymentTermsDays ?? null,
          c.taxId ?? null,
          c.w9OnFile ? 1 : 0,
          c.w9FileUrl ?? null
        )
        .run();
    }
    for (const o of normalized.orders) {
      await d1
        .prepare(
          `INSERT INTO orders (id, number, project_id, quote_id, contractor_id, job_name, tax_rate, status, office_id, created_at,
           scheduled_at, created_by_user_id, salesperson_id, tax_exempt, tax_exempt_number, history_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          o.id,
          o.number,
          o.projectId,
          o.quoteId,
          o.contractorId ?? null,
          o.jobName,
          o.taxRate,
          o.status,
          o.officeId ?? null,
          o.createdAt,
          o.scheduledAt ?? null,
          o.createdByUserId ?? null,
          o.salespersonId ?? null,
          o.taxExempt ? 1 : 0,
          o.taxExemptNumber ?? null,
          JSON.stringify(o.history ?? [])
        )
        .run();
      for (const line of o.lines) {
        await d1
          .prepare(
            `INSERT INTO order_lines (id, order_id, sort_order, quote_route_id, pickup_address, dropoff_address,
             pickup_vendor_id, dropoff_vendor_id, material_name, material_buy_rate, material_sell_rate, material_unit, material_qty_quoted, material_lines,
             disposal_buy_rate, disposal_sell_rate, haul_buy_rate, haul_sell_rate, haul_unit, haul_qty_quoted, taxable)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            line.id,
            o.id,
            line.sortOrder,
            line.quoteRouteId ?? null,
            line.pickupAddress,
            line.dropoffAddress,
            line.pickupVendorId ?? null,
            line.dropoffVendorId ?? null,
            line.materialName ?? null,
            line.materialBuyRate,
            line.materialSellRate,
            line.materialUnit ?? "TN",
            line.materialQtyQuoted,
            line.materialLines?.length ? JSON.stringify(line.materialLines) : null,
            line.disposalBuyRate ?? 0,
            line.disposalSellRate ?? 0,
            line.haulBuyRate,
            line.haulSellRate,
            line.haulUnit ?? "TN",
            line.haulQtyQuoted,
            line.taxable ? 1 : 0
          )
          .run();
      }
    }
    for (const trip of normalized.trips) {
      await d1
        .prepare(
          `INSERT INTO trips (id, number, order_id, dispatch_id, carrier_id, truck_label, driver_name, status, scheduled_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          trip.id,
          trip.number,
          trip.orderId,
          trip.dispatchId,
          trip.carrierId,
          trip.truckLabel ?? null,
          trip.driverName ?? null,
          trip.status,
          trip.scheduledDate ?? null,
          trip.createdAt
        )
        .run();
    }
    for (const d of normalized.dispatches) {
      await d1
        .prepare(
          `INSERT INTO dispatches (id, order_id, order_line_id, carrier_id, status, assigned_at, notes, trip_id, truck_label, scheduled_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          d.id,
          d.orderId,
          d.orderLineId,
          d.carrierId,
          d.status,
          d.assignedAt,
          d.notes ?? null,
          d.tripId ?? null,
          d.truckLabel ?? null,
          d.scheduledDate ?? null
        )
        .run();
    }
    for (const t of normalized.deliveryTickets) {
      await d1
        .prepare(
          `INSERT INTO delivery_tickets (id, dispatch_id, order_id, order_line_id, line_type, material_line_id,
           number, ticket_number, trip_id, paper_ticket_number, qty, unit, delivered_at, status, ticket_image_url,
           rejected_at, approved_by_user_id, driver_sell_rate, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          t.id,
          t.dispatchId,
          t.orderId,
          t.orderLineId,
          t.lineType,
          t.materialLineId ?? null,
          t.number ?? null,
          t.ticketNumber ?? t.paperTicketNumber ?? null,
          t.tripId ?? null,
          t.paperTicketNumber ?? t.ticketNumber ?? null,
          t.qty,
          t.unit,
          t.deliveredAt,
          t.status,
          t.ticketImageUrl ?? null,
          t.rejectedAt ?? null,
          t.approvedByUserId ?? null,
          t.driverSellRate ?? null,
          t.notes ?? null
        )
        .run();
    }
    for (const inv of normalized.customerInvoices) {
      await d1
        .prepare(
          `INSERT INTO customer_invoices (id, number, order_id, project_id, contractor_id, status,
           subtotal, tax, total, issued_at, due_date, lines_json, notes_json, payments_json,
           sent_by_user_id, sent_at, attachment_url, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          inv.id,
          inv.number,
          inv.orderId ?? null,
          inv.projectId ?? null,
          inv.contractorId ?? null,
          inv.status,
          inv.subtotal,
          inv.tax,
          inv.total,
          inv.issuedAt,
          inv.dueDate ?? null,
          JSON.stringify(inv.lines),
          inv.notes?.length ? JSON.stringify(inv.notes) : null,
          inv.payments?.length ? JSON.stringify(inv.payments) : null,
          inv.sentByUserId ?? null,
          inv.sentAt ?? null,
          inv.attachmentUrl ?? null,
          inv.source ?? "ticket"
        )
        .run();
    }
    for (const s of normalized.carrierSettlements) {
      await d1
        .prepare(
          `INSERT INTO carrier_settlements (id, number, order_id, carrier_id, status, subtotal, broker_fee, net_pay,
           issued_at, lines_json, notes_json, due_date, payments_json, approved_by_user_id, approved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          s.id,
          s.number,
          s.orderId,
          s.carrierId,
          s.status,
          s.subtotal,
          s.brokerFee,
          s.netPay,
          s.issuedAt,
          JSON.stringify(s.lines),
          s.notes?.length ? JSON.stringify(s.notes) : null,
          s.dueDate ?? null,
          s.payments?.length ? JSON.stringify(s.payments) : null,
          s.approvedByUserId ?? null,
          s.approvedAt ?? null
        )
        .run();
    }
    for (const s of normalized.vendorSettlements) {
      await d1
        .prepare(
          `INSERT INTO vendor_settlements (id, number, order_id, vendor_id, payee_kind, status, subtotal, net_pay,
           issued_at, lines_json, notes_json, dispute_json, due_date, vendor_invoice_number, vendor_invoice_date,
           payments_json, approved_by_user_id, approved_at, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          s.id,
          s.number,
          s.orderId ?? null,
          s.vendorId,
          s.payeeKind,
          s.status,
          s.subtotal,
          s.netPay,
          s.issuedAt,
          JSON.stringify(s.lines),
          s.notes?.length ? JSON.stringify(s.notes) : null,
          s.dispute ? JSON.stringify(s.dispute) : null,
          s.dueDate ?? null,
          s.vendorInvoiceNumber ?? null,
          s.vendorInvoiceDate ?? null,
          s.payments?.length ? JSON.stringify(s.payments) : null,
          s.approvedByUserId ?? null,
          s.approvedAt ?? null,
          s.source ?? "ticket"
        )
        .run();
    }
  } catch {
    /* migration 0016 / 0017 */
  }

  await saveMeta(d1, normalized.meta);
}

export async function loadServerDb(): Promise<Db> {
  const d1 = getD1();
  if (d1) return loadFromD1(d1);
  return loadFromFile();
}

export async function saveServerDb(db: Db): Promise<void> {
  const normalized = normalizeFullDb(db);
  const d1 = getD1();
  if (d1) {
    await saveToD1(d1, normalized);
    return;
  }
  await saveToFile(normalized);
}
