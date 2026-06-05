import path from "path";
import * as XLSX from "xlsx";
import { Contractor, OfficeCode, User } from "./types";
import { officeIdForCode } from "./db-defaults";
import { generateId } from "./utils";

const OFFICE_CODES: OfficeCode[] = ["ATPB", "ATF", "ATWC", "ATO", "ATCF"];

const PHONE_TAIL = /^[\d\s().+-]{7,}$/;

export function resolveOfficeIdFromBranch(branch: string): string | undefined {
  const u = branch.toUpperCase();
  for (const code of OFFICE_CODES) {
    if (u.includes(code)) return officeIdForCode(code);
  }
  if (u.includes("PALM BEACH") || u.includes("PALM")) return officeIdForCode("ATPB");
  if (u.includes("FLORIDA") && !u.includes("CENTRAL")) return officeIdForCode("ATF");
  if (u.includes("WEST COAST") || u.includes("WEST")) return officeIdForCode("ATWC");
  if (u.includes("ORLANDO")) return officeIdForCode("ATO");
  if (u.includes("CENTRAL")) return officeIdForCode("ATCF");
  return undefined;
}

function cellStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Parse Contact column: optional "Name - phone" or plain name / notes. */
export function parseContactField(contact: string): {
  firstName: string;
  lastName: string;
  phone: string;
  contactNotes?: string;
} {
  const raw = contact.trim();
  if (!raw) {
    return { firstName: "", lastName: "", phone: "" };
  }

  const dash = raw.lastIndexOf(" - ");
  if (dash > 0) {
    const namePart = raw.slice(0, dash).trim();
    const tail = raw.slice(dash + 3).trim();
    if (PHONE_TAIL.test(tail)) {
      const parts = namePart.split(/\s+/).filter(Boolean);
      return {
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
        phone: tail,
      };
    }
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
      phone: "",
    };
  }

  return {
    firstName: "",
    lastName: "",
    phone: "",
    contactNotes: raw,
  };
}

export interface LoadContractorsResult {
  contractors: Contractor[];
  /** Salesperson users keyed by lowercase name (mutated during load). */
  userMap: Map<string, User>;
}

/**
 * Load contractors from ATPB customer spreadsheet — one row per contractor.
 * Ignores Customer ID and ATPB Contact columns.
 */
export function loadContractorsFromWorkbook(
  filePath: string,
  userMap: Map<string, User>
): LoadContractorsResult {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets["Sheet1"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const contractors: Contractor[] = [];

  for (const row of rows) {
    const company = cellStr(row["Customer Name"] ?? row["CUSTOMER NAME"] ?? row["Company"]);
    if (!company) continue;

    const branch = cellStr(row["Branch"] ?? row["BRANCH"]);
    const salesPerson = cellStr(row["Sales Person"] ?? row["Sales person"] ?? row["Salesperson"]);
    const contact = cellStr(row["Contact"] ?? row["CONTACT"]);
    const email = cellStr(row["Email"] ?? row["EMAIL"]);
    const address = cellStr(row["Address"] ?? row["ADDRESS"]);

    let salespersonId: string | undefined;
    if (salesPerson) {
      const spKey = salesPerson.toLowerCase();
      if (!userMap.has(spKey)) {
        userMap.set(spKey, {
          id: generateId(),
          name: salesPerson,
          role: "salesperson",
          officeId: resolveOfficeIdFromBranch(branch),
        });
      }
      salespersonId = userMap.get(spKey)!.id;
    }

    const parsed = parseContactField(contact);

    contractors.push({
      id: generateId(),
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      company,
      email,
      phone: parsed.phone,
      address,
      officeId: resolveOfficeIdFromBranch(branch),
      salespersonId,
      contactNotes: parsed.contactNotes,
    });
  }

  return { contractors, userMap };
}

/** Merge imported users with local DB; preserve local admin id when present. */
export function mergeImportUsers(local: User[], imported: User[]): User[] {
  const localAdmin = local.find((u) => u.role === "admin");
  const salesAndOther = imported.filter((u) => u.role !== "admin");
  if (localAdmin) return [localAdmin, ...salesAndOther];
  return imported;
}

export function defaultCustomersFilePath(dataDir: string): string {
  return path.join(dataDir, "petrafi atpb upload.xlsx");
}
