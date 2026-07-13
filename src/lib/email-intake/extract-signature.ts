import type { ParsedSignature } from "./types";
import { getInternalEmailDomains, emailDomain } from "../active-office";
import type { Db } from "../types";

const SIG_DELIMITERS = [
  /\n--\s*\n/,
  /\n_{3,}\n/,
  /\nSent from my /i,
  /\nGet Outlook for /i,
  /\nThis email and any attachments/i,
];

export function isInternalEmail(email: string, internalDomains?: string[]): boolean {
  const domains = internalDomains ?? getInternalEmailDomains();
  const domain = emailDomain(email);
  if (!domain) return false;
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
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

export function findAllEmbeddedSenders(body: string): { name: string; email: string }[] {
  const results: { name: string; email: string }[] = [];
  const re = /From:\s*([^\n<]+?)\s*<([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    results.push({ name: m[1].trim(), email: m[2].trim().toLowerCase() });
  }
  const re2 = /From:\s*(\S+@\S+)/gi;
  while ((m = re2.exec(body)) !== null) {
    const email = m[1].trim().toLowerCase();
    if (!results.some((r) => r.email === email)) {
      results.push({ name: "", email });
    }
  }
  return results;
}

export function findOriginalExternalSender(
  body: string,
  internalDomains: string[]
): { name: string; email: string } | null {
  for (const sender of findAllEmbeddedSenders(body)) {
    if (!isInternalEmail(sender.email, internalDomains)) return sender;
  }
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
  topSender: { name: string; email: string },
  options?: { db?: Db; internalDomains?: string[] }
): {
  signature: ParsedSignature;
  mainBody: string;
  isForwarded: boolean;
  originalSender?: { name: string; email: string };
} {
  const internalDomains =
    options?.internalDomains ?? getInternalEmailDomains(options?.db);
  const { mainBody, signatureBlock } = splitBodyAndSignature(bodyText);
  const embeddedSenders = findAllEmbeddedSenders(mainBody);
  const externalOriginal = findOriginalExternalSender(mainBody, internalDomains);
  const topInternal = isInternalEmail(topSender.email, internalDomains);
  const forwarded =
    topInternal ||
    embeddedSenders.length > 0 ||
    /^\s*(FW|Fwd|RE):/im.test(bodyText.slice(0, 200));

  const customerSender = externalOriginal ?? (topInternal ? null : topSender);

  const sig = parseSignatureBlock(signatureBlock);
  if (customerSender) {
    if (
      externalOriginal ||
      !sig.email ||
      isInternalEmail(sig.email, internalDomains)
    ) {
      sig.email = customerSender.email;
    }
    if (externalOriginal || !sig.name) sig.name = customerSender.name;
    if (externalOriginal || !sig.company) {
      sig.company = companyFromEmail(customerSender.email);
    }
  } else {
    const useEmail = topSender.email;
    const useName = topSender.name;
    if (!sig.email) sig.email = useEmail;
    if (!sig.name) sig.name = useName;
    if (!sig.company) sig.company = companyFromEmail(useEmail);
  }

  return {
    signature: sig,
    mainBody,
    isForwarded: forwarded,
    originalSender: externalOriginal ?? embeddedSenders[0],
  };
}
