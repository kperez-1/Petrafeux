export type OfficeCode = "ATPB" | "ATF" | "ATWC" | "ATO" | "ATCF";

export interface Office {
  id: string;
  code: OfficeCode;
  name: string;
}

export type UserRole = "admin" | "salesperson";

export interface User {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  officeId?: string;
}

export type ProjectStage =
  | "new"
  | "proposal_requested"
  | "proposal_presented"
  | "in_negotiation"
  | "closed_won"
  | "closed_lost";

export const PROJECT_STAGES: { value: ProjectStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "proposal_requested", label: "Proposal Requested" },
  { value: "proposal_presented", label: "Proposal Presented" },
  { value: "in_negotiation", label: "In Negotiation" },
  { value: "closed_won", label: "Closed Won" },
  { value: "closed_lost", label: "Closed Lost" },
];

/** Per-company bid tracking on a shared project */
export type ProjectBidderStatus =
  | "proposal_requested"
  | "proposal_presented"
  | "lost"
  | "won";

export const PROJECT_BIDDER_STATUSES: { value: ProjectBidderStatus; label: string }[] = [
  { value: "proposal_requested", label: "Proposal Requested" },
  { value: "proposal_presented", label: "Proposal Presented" },
  { value: "lost", label: "Lost" },
  { value: "won", label: "Won" },
];

export interface ProjectBidder {
  id: string;
  projectId: string;
  company: string;
  contractorId?: string;
  status: ProjectBidderStatus;
  notes?: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  address: string;
  description: string;
  createdAt: string;
  updatedAt?: string;
  stage?: ProjectStage;
  archived?: boolean;
  officeId?: string;
  salespersonId?: string;
  sourceCompany?: string;
  sourceContractorId?: string;
  intakeDueDate?: string;
}

export interface ProjectEmailIntake {
  id: string;
  projectId: string;
  company: string;
  contractorId: string;
  receivedAt: string;
  subject: string;
  fromName?: string;
  fromEmail: string;
  bodyText: string;
  bodyHtml?: string;
  signatureText?: string;
  isForwarded?: boolean;
  attachmentIds: string[];
}

export interface EmailAttachment {
  id: string;
  intakeId: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  /** Base64 file bytes when stored in D1 (Cloudflare Workers — no filesystem). */
  contentBase64?: string;
}

export interface Contractor {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  ein?: string;
  officeId?: string;
  salespersonId?: string;
  contactNotes?: string;
}

export interface Vendor {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  /** True when pin is city/zip centroid, not street-level */
  mapCoordsApproximate?: boolean;
  type: "quarry" | "disposal";
  /** Short-lived material site (excess on a job, gone in weeks/months) */
  temporary?: boolean;
}

/** Material pricing unit codes */
export type MaterialPriceUnit = "TN" | "CY" | "LD" | "HR";

export const DEFAULT_MATERIAL_PRICE_UNIT: MaterialPriceUnit = "TN";

export const MATERIAL_PRICE_UNITS: { value: MaterialPriceUnit; label: string }[] = [
  { value: "TN", label: "Per Ton (TN)" },
  { value: "CY", label: "Cubic Yard (CY)" },
  { value: "LD", label: "Load (LD)" },
  { value: "HR", label: "Hour (HR)" },
];

export function normalizeMaterialUnit(unit?: string): MaterialPriceUnit {
  if (unit === "CY" || unit === "LD" || unit === "HR") return unit;
  return DEFAULT_MATERIAL_PRICE_UNIT;
}

export function unitQtyLabel(unit?: MaterialPriceUnit): string {
  const u = normalizeMaterialUnit(unit);
  const map: Record<MaterialPriceUnit, string> = {
    TN: "tons",
    CY: "CY",
    LD: "loads",
    HR: "hours",
  };
  return map[u];
}

export function unitRateLabel(unit?: MaterialPriceUnit): string {
  return `$/${normalizeMaterialUnit(unit)}`;
}

export interface Material {
  id: string;
  vendorId: string;
  /** Quarries/pits that carry this material (shared catalog names) */
  vendorIds?: string[];
  vendorName?: string;
  name: string;
  type: string;
  /** Price amount; unit is stored in priceUnit */
  pricePerTon: number;
  priceUnit?: MaterialPriceUnit;
  /** Resized JPEG data URLs (base64) attached to this material */
  photos?: string[];
}

export interface RouteMaterialLine {
  id: string;
  materialId?: string;
  materialName?: string;
  materialType?: string;
  materialRate: number;
  materialCost: number;
  materialQty: number;
  materialUnit?: MaterialPriceUnit;
}

export interface HaulRate {
  id: string;
  miles: number;
  ratePerLoad: number;
}

/** @deprecated Legacy zone-based haul rate shape (normalized on load) */
export interface LegacyHaulRate {
  id: string;
  zoneName?: string;
  minMiles?: number;
  maxMiles?: number;
  ratePerTon?: number;
  miles?: number;
  ratePerLoad?: number;
}

export interface QuoteRoute {
  id: string;
  quoteId: string;
  sortOrder: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupVendorId?: string;
  haulRate: number;
  haulCost: number;
  haulQty: number;
  haulUnit?: MaterialPriceUnit;
  /** Road driving miles used for the haul rate (matches the vendor map). */
  haulMiles?: number;
  /** Looked-up per-load base rate; used to re-derive buy when the unit changes. */
  haulRatePerLoad?: number;
  materialId?: string;
  materialName?: string;
  materialType?: string;
  materialRate: number;
  materialCost: number;
  materialQty: number;
  materialUnit?: MaterialPriceUnit;
  /** Multiple materials per route (preferred) */
  materialLines?: RouteMaterialLine[];
  taxable: boolean;
}

export type QuoteStatus = "unsent" | "sent" | "approved" | "rejected";

export type QuoteHistoryType =
  | "created"
  | "sent"
  | "approved"
  | "rejected"
  | "duplicated_from";

export interface QuoteHistoryEvent {
  id: string;
  type: QuoteHistoryType;
  at: string;
  note?: string;
}

export interface Quote {
  id: string;
  projectId: string;
  projectName?: string;
  number: string;
  jobName: string;
  contractorId?: string;
  contractorName?: string;
  status: QuoteStatus;
  taxRate: number;
  routes: QuoteRoute[];
  createdAt: string;
  sentAt?: string;
  history?: QuoteHistoryEvent[];
}

export interface DbMeta {
  quoteCounter: number;
  defaultTaxRate?: number;
  haulBrokerFeePercent?: number;
  haulSellMarginPercent?: number;
  orgName?: string;
  orgCode?: string;
  currentUserId?: string;
  haulRateAdjustmentPercent?: number;
}

export type ActivityType = "call" | "meeting" | "jobsite_visit";
export type ActivityStatus = "scheduled" | "completed";

export interface Activity {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  subject: string;
  notes?: string;
  scheduledAt: string;
  completedAt?: string;
  projectId?: string;
  contractorId?: string;
  company?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Db {
  projects: Project[];
  quotes: Quote[];
  contractors: Contractor[];
  vendors: Vendor[];
  materials: Material[];
  haulRates: HaulRate[];
  activities: Activity[];
  emailIntakes: ProjectEmailIntake[];
  emailAttachments: EmailAttachment[];
  projectBidders: ProjectBidder[];
  offices: Office[];
  users: User[];
  meta: DbMeta;
}
