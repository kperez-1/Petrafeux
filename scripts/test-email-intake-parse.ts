import { parseProjectFromFileName } from "../src/lib/email-intake/extract-project";
import { buildMatchPreview } from "../src/lib/email-intake/match-contractor";
import type { ParsedEmailIntake } from "../src/lib/email-intake/types";
import { EMPTY_DB } from "../src/lib/db-defaults";

const fileName =
  "EXTERNAL_ Oakwood Square Retail (Boynton Beach_ FL) _ Due_ Jun 12_ 2026 _.msg";

const fromFile = parseProjectFromFileName(fileName);
console.log("Filename parse:", fromFile);

const parsed: ParsedEmailIntake = {
  subject: "Invitation to Bid - Oakwood Square Retail",
  from: { name: "Internal", email: "user@alliedtk.com" },
  bodyText: "Location: 123 Main St, Boynton Beach, FL 33426",
  signature: {
    name: "Jane Doe",
    email: "jane@oakwood.com",
    phone: "561-555-0100",
    company: "Oakwood Development",
    address: "999 HQ Blvd, Miami, FL",
  },
  project: {
    name: fromFile.name ?? "",
    address: "",
    dueDate: fromFile.dueDate,
  },
  isForwarded: true,
  attachmentNames: ["plans.pdf"],
};

const matches = buildMatchPreview(EMPTY_DB, parsed);
console.log("Match preview (empty db):", matches);

if (fromFile.name?.includes("Oakwood") && fromFile.dueDate?.includes("Jun")) {
  console.log("OK: Oakwood filename pattern");
  process.exit(0);
}
console.error("FAIL: expected Oakwood + due date from filename");
process.exit(1);
