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
} from "./types";
import { EMPTY_DB, normalizeMeta, seedOffices } from "./db-defaults";
import { normalizeFullDb } from "./normalize-db";
import { normalizeHaulRate } from "./haul-pricing";
import type { LegacyHaulRate } from "./types";
import { normalizeRouteMaterials, syncRouteLegacyMaterial } from "./route-materials";
import { parseHaulRatesTxt } from "./haul-rates-seed";

const DATA_FILE = path.join(process.cwd(), ".data", "petrafi-db.json");
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
    })),
    materials: materials.results.map((r) => ({
      id: String(r.id),
      vendorId: String(r.vendor_id ?? ""),
      name: String(r.name),
      type: String(r.type ?? ""),
      pricePerTon: Number(r.price_per_ton) || 0,
      priceUnit: (r.price_unit as Material["priceUnit"]) ?? "TN",
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
      .prepare("INSERT INTO vendors (id, name, address, lat, lng, type, temporary) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(v.id, v.name, v.address, v.lat ?? null, v.lng ?? null, v.type, v.temporary ? 1 : 0)
      .run();
  }
  for (const m of normalized.materials) {
    await d1
      .prepare(
        "INSERT INTO materials (id, vendor_id, name, type, price_per_ton, price_unit, photos) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        m.id,
        m.vendorId,
        m.name,
        m.type,
        m.pricePerTon,
        m.priceUnit ?? "TN",
        m.photos?.length ? JSON.stringify(m.photos) : null
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
           pickup_vendor_id, haul_rate, haul_cost, haul_qty, haul_unit, haul_miles, haul_rate_per_load,
           material_id, material_name,
           material_type, material_rate, material_cost, material_qty, material_unit, material_lines, taxable)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          r.id,
          q.id,
          r.sortOrder,
          r.pickupAddress,
          r.dropoffAddress,
          r.pickupVendorId ?? null,
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
           project_id, contractor_id, company, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
