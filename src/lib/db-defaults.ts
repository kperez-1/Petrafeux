import { Db, DbMeta, Material, Project, ProjectStage, LegacyHaulRate, Office, OfficeCode } from "./types";
import { normalizeOrderStatus } from "./order-status";
import { normalizeHaulRate } from "./haul-pricing";

export const DEFAULT_HAUL_BROKER_FEE_PERCENT = 10;
export const DEFAULT_TAX_RATE = 7;
export const DEFAULT_HAUL_SELL_MARGIN_PERCENT = 15;

export const DEFAULT_OFFICES: Omit<Office, "id">[] = [
  { code: "ATPB", name: "AT of Palm Beach" },
  { code: "ATF", name: "AT Florida" },
  { code: "ATWC", name: "AT West Coast" },
  { code: "ATO", name: "AT Orlando" },
  { code: "ATCF", name: "AT Central Florida" },
];

export function officeIdForCode(code: OfficeCode): string {
  return `office-${code.toLowerCase()}`;
}

export function seedOffices(): Office[] {
  return DEFAULT_OFFICES.map((o) => ({
    id: officeIdForCode(o.code),
    ...o,
  }));
}

export const EMPTY_DB: Db = {
  projects: [],
  quotes: [],
  contractors: [],
  vendors: [],
  materials: [],
  haulRates: [],
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
  offices: seedOffices(),
  users: [],
  meta: {
    quoteCounter: 0,
    orderCounter: 0,
    tripCounter: 0,
    ticketCounter: 0,
    invoiceCounter: 0,
    settlementCounter: 0,
    vendorSettlementCounter: 0,
    defaultTaxRate: DEFAULT_TAX_RATE,
    haulBrokerFeePercent: DEFAULT_HAUL_BROKER_FEE_PERCENT,
    haulSellMarginPercent: DEFAULT_HAUL_SELL_MARGIN_PERCENT,
    orgName: "AT of Palm Beach",
    orgCode: "ATPB",
  },
};

export function normalizeMeta(meta?: Partial<DbMeta>): DbMeta {
  return {
    quoteCounter: meta?.quoteCounter ?? 0,
    orderCounter: meta?.orderCounter ?? 0,
    tripCounter: meta?.tripCounter ?? 0,
    ticketCounter: meta?.ticketCounter ?? 0,
    invoiceCounter: meta?.invoiceCounter ?? 0,
    settlementCounter: meta?.settlementCounter ?? 0,
    vendorSettlementCounter: meta?.vendorSettlementCounter ?? 0,
    defaultTaxRate: meta?.defaultTaxRate ?? DEFAULT_TAX_RATE,
    haulBrokerFeePercent: meta?.haulBrokerFeePercent ?? DEFAULT_HAUL_BROKER_FEE_PERCENT,
    haulSellMarginPercent: meta?.haulSellMarginPercent ?? DEFAULT_HAUL_SELL_MARGIN_PERCENT,
    orgName: meta?.orgName ?? EMPTY_DB.meta.orgName,
    orgCode: meta?.orgCode ?? EMPTY_DB.meta.orgCode,
    currentUserId: meta?.currentUserId,
    haulRateAdjustmentPercent: meta?.haulRateAdjustmentPercent,
  };
}

const VALID_STAGES: ProjectStage[] = [
  "new",
  "proposal_requested",
  "proposal_presented",
  "in_negotiation",
  "closed_won",
  "closed_lost",
];

export function normalizeProjectStage(stage?: string): ProjectStage {
  if (stage && VALID_STAGES.includes(stage as ProjectStage)) return stage as ProjectStage;
  return "new";
}

export function normalizeProject(p: Project): Project {
  const stage = normalizeProjectStage(p.stage);
  const archived = p.archived ?? stage === "closed_lost";
  return {
    ...p,
    stage,
    archived,
    updatedAt: p.updatedAt ?? p.createdAt,
  };
}

export function normalizeDb(raw: Partial<Db> | null | undefined): Db {
  if (!raw) return { ...EMPTY_DB, offices: seedOffices() };
  const offices = raw.offices?.length ? raw.offices : seedOffices();
  return {
    ...EMPTY_DB,
    ...raw,
    meta: normalizeMeta(raw.meta),
    offices,
    users: raw.users ?? [],
    projects: (raw.projects ?? []).map(normalizeProject),
    haulRates: (raw.haulRates ?? []).map((h) => normalizeHaulRate(h as LegacyHaulRate)),
    materials: (raw.materials ?? []).map(normalizeMaterial),
    quotes: (raw.quotes ?? []).map((q) => ({
      ...q,
      history: q.history ?? [{ id: "created", type: "created" as const, at: q.createdAt }],
    })),
    activities: raw.activities ?? [],
    emailIntakes: raw.emailIntakes ?? [],
    emailAttachments: raw.emailAttachments ?? [],
    projectBidders: raw.projectBidders ?? [],
    carriers: raw.carriers ?? [],
    orders: (raw.orders ?? []).map((o) => ({
      ...o,
      status: normalizeOrderStatus(o.status),
      lines: (o.lines ?? []).map((l) => ({
        ...l,
        disposalBuyRate: l.disposalBuyRate ?? 0,
        disposalSellRate: l.disposalSellRate ?? 0,
      })),
      history: o.history ?? [],
    })),
    trips: raw.trips ?? [],
    dispatches: raw.dispatches ?? [],
    deliveryTickets: (raw.deliveryTickets ?? []).map((t) => ({
      ...t,
      paperTicketNumber: t.paperTicketNumber ?? t.ticketNumber,
    })),
    customerInvoices: (raw.customerInvoices ?? []).map((inv) => ({
      ...inv,
      lines: inv.lines ?? [],
    })),
    carrierSettlements: (raw.carrierSettlements ?? []).map((s) => ({
      ...s,
      lines: s.lines ?? [],
    })),
    vendorSettlements: (raw.vendorSettlements ?? []).map((s) => ({
      ...s,
      lines: s.lines ?? [],
    })),
  };
}

export function getBrokerFeePercent(meta?: DbMeta): number {
  const n = meta?.haulBrokerFeePercent;
  if (typeof n === "number" && n >= 0 && n <= 100) return n;
  return DEFAULT_HAUL_BROKER_FEE_PERCENT;
}

function normalizeMaterial(m: Material): Material {
  const vendorIds =
    m.vendorIds?.length ? m.vendorIds : m.vendorId ? [m.vendorId] : [];
  return { ...m, vendorIds };
}

export function getHaulSellMarginPercent(meta?: DbMeta): number {
  const n = meta?.haulSellMarginPercent;
  if (typeof n === "number" && n >= 0) return n;
  return DEFAULT_HAUL_SELL_MARGIN_PERCENT;
}
