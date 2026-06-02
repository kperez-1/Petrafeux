export interface Project {
  id: string;
  name: string;
  address: string;
  description: string;
  createdAt: string;
}

export interface Contractor {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  address: string;
}

export interface Vendor {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  type: "quarry" | "disposal";
}

export interface Material {
  id: string;
  vendorId: string;
  vendorName?: string;
  name: string;
  type: string;
  pricePerTon: number;
}

export interface HaulRate {
  id: string;
  zoneName: string;
  minMiles: number;
  maxMiles: number;
  ratePerTon: number;
}

export interface QuoteRoute {
  id: string;
  quoteId: string;
  sortOrder: number;
  pickupAddress: string;
  dropoffAddress: string;
  haulRate: number;
  haulCost: number;
  haulQty: number;
  materialId?: string;
  materialName?: string;
  materialType?: string;
  materialRate: number;
  materialCost: number;
  materialQty: number;
  taxable: boolean;
}

export type QuoteStatus = "unsent" | "sent" | "approved" | "rejected";

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
}

export interface Db {
  projects: Project[];
  quotes: Quote[];
  contractors: Contractor[];
  vendors: Vendor[];
  materials: Material[];
  haulRates: HaulRate[];
  meta: { quoteCounter: number };
}
