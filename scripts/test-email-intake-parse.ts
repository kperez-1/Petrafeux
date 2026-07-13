import {
  cleanSubject,
  extractAddressFromSubject,
  extractProjectFromEmail,
  parseProjectFromFileName,
} from "../src/lib/email-intake/extract-project";
import {
  extractCustomerFromBody,
  findOriginalExternalSender,
} from "../src/lib/email-intake/extract-signature";
import { EMPTY_DB } from "../src/lib/db-defaults";

const internal = ["alliedtk.com", "petrafi.com"];

// Forwarded internal → external customer
const forwardBody = `From: Jane Customer <jane@oakwood.com>
Sent: Monday, June 1, 2026
Subject: Bid request

Location: 123 Jobsite Rd, Boynton Beach, FL 33426

Thanks,
--
John Internal
user@alliedtk.com`;

const customer = extractCustomerFromBody(forwardBody, {
  name: "John Internal",
  email: "user@alliedtk.com",
});
if (customer.originalSender?.email !== "jane@oakwood.com") {
  console.error("FAIL: expected jane@oakwood.com as original sender");
  process.exit(1);
}
if (customer.signature.email !== "jane@oakwood.com") {
  console.error("FAIL: expected customer email on signature");
  process.exit(1);
}

// Double forward chain
const doubleForward = `From: Bob Builder <bob@builder.com>
From: Internal User <user@alliedtk.com>
Location: 500 Main St`;
const ext = findOriginalExternalSender(doubleForward, internal);
if (ext?.email !== "bob@builder.com") {
  console.error("FAIL: double forward should find bob@builder.com");
  process.exit(1);
}

// Signature address must not become jobsite
const project = extractProjectFromEmail(
  "RE: FW: Oakwood Square (Boynton Beach, FL)",
  "Location: 123 Jobsite Rd, Boynton Beach, FL 33426",
  undefined,
  { excludeAddresses: ["999 HQ Blvd, Miami, FL"] }
);
if (!project.address.includes("Jobsite")) {
  console.error("FAIL: expected jobsite address from body");
  process.exit(1);
}
if (project.name !== "Oakwood Square (Boynton Beach, FL)") {
  console.error("FAIL: expected cleaned subject as project name, got", project.name);
  process.exit(1);
}

// Subject-only fallback
const subjectOnly = extractProjectFromEmail(
  "RE: FW: Oakwood Square Retail",
  "",
  undefined,
  { excludeAddresses: ["999 HQ Blvd"] }
);
if (subjectOnly.name !== "Oakwood Square Retail") {
  console.error("FAIL: subject fallback name");
  process.exit(1);
}

// Filename parse
const fileName =
  "EXTERNAL_ Oakwood Square Retail (Boynton Beach_ FL) _ Due_ Jun 12_ 2026 _.msg";
const fromFile = parseProjectFromFileName(fileName);
if (!fromFile.name?.includes("Oakwood") || !fromFile.dueDate?.includes("Jun")) {
  console.error("FAIL: filename parse");
  process.exit(1);
}

// cleanSubject loops
if (cleanSubject("RE: FW: Test Project") !== "Test Project") {
  console.error("FAIL: cleanSubject");
  process.exit(1);
}

// Attachment hint
const withAttach = extractProjectFromEmail("Bid", "", undefined, {
  attachmentNames: ["Plans - Oakwood (Boynton Beach, FL).pdf"],
  excludeAddresses: [],
});
if (!withAttach.addressHint?.includes("Boynton")) {
  console.error("FAIL: attachment address hint");
  process.exit(1);
}

console.log("OK: all email intake parse fixtures passed");
process.exit(0);
