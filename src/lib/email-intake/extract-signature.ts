import type { ParsedSignature } from "./types";

const INTERNAL_DOMAINS = ["alliedtk.com", "petrafi.com"];

const SIG_DELIMITERS = [
  /\n--\s*\n/,
  /\n_{3,}\n/,
  /\nSent from my /i,
  /\nGet Outlook for /i,
  /\nThis email and any attachments/i,
];

export function isInternalEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return INTERNAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function splitBodyAndSignature(bodyText: string): {
  mainBody: string;
  signatureBlock: string;
} {
  let cut = bodyText.length;
  for (const re of SIG_DELIMITERS) {
    const m = bodyText.match(re);
    if (m && m.index != null && m.index < cut) cut = m.index;
  }
  const mainBody = bodyText.slice(0, cut).trim();
  const signatureBlock = bodyText.slice(cut).trim();
  return { mainBody, signatureBlock };
}

function parseEmbeddedFrom(body: string): { name: string; email: string } | null {
  const m = body.match(/From:\s*([^\n<]+?)\s*<([^>]+)>/i);
  if (m) {
    return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  }
  const m2 = body.match(/From:\s*(\S+@\S+)/i);
  if (m2) return { name: "", email: m2[1].trim().toLowerCase() };
  return null;
}

function companyFromEmail(email: string): string {
  const domain = email.split("@")[1]?.split(".")[0] ?? "";
  if (!domain) return "";
  return domain.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseSignatureBlock(block: string): ParsedSignature {
  const lines = block
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let email = "";
  let phone = "";
  let name = "";
  let title = "";
  let address = "";
  let website = "";
  const addressLines: string[] = [];

  for (const line of lines) {
    const em = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (em && !email) email = em[0].toLowerCase();

    const ph = line.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
    if (ph && !phone) phone = ph[0].trim();

    const web = line.match(/(?:https?:\/\/)?(?:www\.)?[\w.-]+\.(com|net|org|edu)/i);
    if (web && !website) website = web[0];

    if (
      /\d{5}/.test(line) &&
      /[A-Za-z]/.test(line) &&
      !line.includes("@") &&
      !ph
    ) {
      addressLines.push(line);
    }
  }

  if (addressLines.length) address = addressLines.join(", ");

  const nameLine = lines.find(
    (l) =>
      !l.includes("@") &&
      !/\d{3}/.test(l) &&
      l.length < 60 &&
      !/engineer|manager|president|director|llc|inc|ltd/i.test(l)
  );
  if (nameLine && /^[A-Z][a-z]+/.test(nameLine)) {
    const parts = nameLine.split(/\s+/);
    if (parts.length >= 2 && parts.length <= 5) name = nameLine;
  }

  const titleLine = lines.find((l) =>
    /engineer|manager|president|director|estimator|coordinator|superintendent/i.test(l)
  );
  if (titleLine) title = titleLine;

  const company =
    lines.find((l) => /\|/.test(l))?.split("|").pop()?.trim() ||
    lines.find((l) => /llc|inc|l\.?p\.?|corp|company|group|engineering/i.test(l)) ||
    (email ? companyFromEmail(email) : "");

  return {
    name,
    title,
    email,
    phone,
    company: typeof company === "string" ? company : String(company),
    address,
    website,
  };
}

export function extractCustomerFromBody(
  bodyText: string,
  topSender: { name: string; email: string }
): {
  signature: ParsedSignature;
  mainBody: string;
  isForwarded: boolean;
  originalSender?: { name: string; email: string };
} {
  const { mainBody, signatureBlock } = splitBodyAndSignature(bodyText);
  const embedded = parseEmbeddedFrom(mainBody);
  const forwarded = isInternalEmail(topSender.email) && embedded != null;

  if (forwarded && embedded && !isInternalEmail(embedded.email)) {
    const sig = parseSignatureBlock(signatureBlock);
    if (!sig.email) sig.email = embedded.email;
    if (!sig.name) sig.name = embedded.name;
    if (!sig.company) sig.company = companyFromEmail(embedded.email);
    return {
      signature: sig,
      mainBody,
      isForwarded: true,
      originalSender: embedded,
    };
  }

  const useEmail = forwarded && embedded ? embedded.email : topSender.email;
  const useName = forwarded && embedded ? embedded.name : topSender.name;
  const sig = parseSignatureBlock(signatureBlock);
  if (!sig.email) sig.email = useEmail;
  if (!sig.name) sig.name = useName;
  if (!sig.company) sig.company = companyFromEmail(useEmail);

  return {
    signature: sig,
    mainBody,
    isForwarded: forwarded,
    originalSender: embedded ?? undefined,
  };
}
