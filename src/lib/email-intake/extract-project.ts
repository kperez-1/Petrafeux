import type { ParsedProjectFields } from "./types";

function normAddress(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function cleanSubject(subject: string): string {
  let s = subject.trim();
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s
      .replace(/^\[EXTERNAL\]\s*/i, "")
      .replace(/^FW:\s*/i, "")
      .replace(/^Fwd:\s*/i, "")
      .replace(/^RE:\s*/i, "")
      .trim();
  }
  return s;
}

/** Parse project hints from filename like EXTERNAL_ Oakwood Square Retail (Boynton Beach_ FL) _ Due_ Jun 12_ 2026 _.msg */
export function parseProjectFromFileName(fileName: string): Partial<ParsedProjectFields> {
  const base = fileName.replace(/\.msg$/i, "").trim();
  let name = "";
  let dueDate: string | undefined;
  let addressHint: string | undefined;

  const paren = base.match(/\(([^)]+)\)/);
  if (paren) {
    addressHint = paren[1].replace(/_/g, ", ").replace(/\s+/g, " ").trim();
  }

  const dueMatch = base.match(/Due[_\s]+([A-Za-z]+\s+\d{1,2}[,_\s]+\d{4})/i);
  if (dueMatch) {
    dueDate = dueMatch[1].replace(/_/g, " ").trim();
    name = base
      .replace(/EXTERNAL[_\s]*/i, "")
      .replace(/Due[_\s]+[A-Za-z]+\s+\d{1,2}[,_\s]+\d{4}.*/i, "")
      .replace(/[_]+/g, " ")
      .trim();
  } else {
    name = base.replace(/EXTERNAL[_\s]*/i, "").replace(/_/g, " ").trim();
  }

  name = name
    .replace(/\s+/g, " ")
    .replace(/\(\s*/g, "(")
    .replace(/\s*\)/g, ")")
    .replace(/\(([^)]+)\)/g, (_, inner: string) => {
      const fixed = inner.replace(/_/g, ", ").replace(/\s+/g, " ").trim();
      return `(${fixed})`;
    });
  if (name) return { name, dueDate, addressHint };

  return { addressHint };
}

export function extractAddressFromSubject(subject: string): string {
  const cleaned = cleanSubject(subject);
  const atMatch = cleaned.match(/\bat\s+(\d+[^|]+)/i);
  if (atMatch) return atMatch[1].trim();

  const streetMatch = cleaned.match(
    /\b\d+\s+[A-Za-z0-9\s.'-]+(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Way|Ln|Lane)[^|]*/i
  );
  if (streetMatch) return streetMatch[0].trim();

  return "";
}

export function extractAddressHintsFromAttachments(names: string[]): string {
  const hints: string[] = [];
  for (const name of names) {
    const paren = name.match(/\(([^)]+)\)/);
    if (paren) {
      hints.push(paren[1].replace(/_/g, ", ").trim());
      continue;
    }
    const cityState = name.match(/([A-Za-z\s]+(?:Beach|City|Springs)?),?\s*([A-Z]{2})\b/);
    if (cityState) hints.push(`${cityState[1].trim()}, ${cityState[2]}`);
  }
  return hints[0] ?? "";
}

function isExcludedAddress(candidate: string, excludeAddresses: string[]): boolean {
  const n = normAddress(candidate);
  if (!n) return true;
  return excludeAddresses.some((ex) => ex && normAddress(ex) === n);
}

const STREET_RE =
  /\b\d+\s+[A-Za-z0-9\s.'-]+(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Way|Ln|Lane|Hwy|Highway)[^,\n]*,?\s*[A-Za-z\s]+,?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/i;

export function extractProjectFromEmail(
  subject: string,
  mainBody: string,
  fileName?: string,
  options?: {
    excludeAddresses?: string[];
    attachmentNames?: string[];
  }
): ParsedProjectFields {
  const exclude = (options?.excludeAddresses ?? []).filter(Boolean);
  const fromFile = fileName ? parseProjectFromFileName(fileName) : {};
  const cleanedSubject = cleanSubject(subject);

  let name = fromFile.name ?? "";
  let address = "";
  let dueDate = fromFile.dueDate;
  let addressHint = fromFile.addressHint;
  let descriptionSnippet = "";

  if (!name) {
    const subjDue = cleanedSubject.match(/^(.+?)\s*[-–|]\s*Due[:\s]+(.+)$/i);
    if (subjDue) {
      name = subjDue[1].trim();
      dueDate = dueDate ?? subjDue[2].trim();
    } else {
      name = cleanedSubject;
    }
  }

  const subjAddr = extractAddressFromSubject(subject);
  if (subjAddr && !isExcludedAddress(subjAddr, exclude)) {
    address = subjAddr;
  }

  const addrPatterns = [
    /(?:Location|Address|Site|Jobsite|Job\s*Site|Project\s*Location)\s*:\s*([^\n]+)/i,
    /(?:located at|jobsite at|site at)\s+(\d+[^.\n]{10,120})/i,
  ];
  if (!address) {
    for (const re of addrPatterns) {
      const m = mainBody.match(re);
      if (m) {
        const candidate = m[1].trim();
        if (!isExcludedAddress(candidate, exclude)) {
          address = candidate;
          break;
        }
      }
    }
  }

  if (!address) {
    const street = mainBody.match(STREET_RE);
    if (street && !isExcludedAddress(street[0].trim(), exclude)) {
      address = street[0].trim();
    }
  }

  if (!addressHint && options?.attachmentNames?.length) {
    addressHint = extractAddressHintsFromAttachments(options.attachmentNames) || undefined;
  }

  if (!dueDate) {
    const dueM = mainBody.match(/Due[:\s]+([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i);
    if (dueM) dueDate = dueM[1].trim();
  }

  const descLines = mainBody
    .split(/\n/)
    .filter((l) => l.trim().length > 20)
    .slice(0, 5);
  if (descLines.length) descriptionSnippet = descLines.join("\n").slice(0, 500);

  name = name.replace(/\s*[-–|]\s*Due.*$/i, "").trim();
  if (!name) name = cleanedSubject || "Untitled project";

  return {
    name: name || "Untitled project",
    address,
    dueDate,
    descriptionSnippet,
    addressHint,
  };
}
