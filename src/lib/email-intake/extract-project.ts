import type { ParsedProjectFields } from "./types";

function cleanSubject(subject: string): string {
  return subject
    .replace(/^\[EXTERNAL\]\s*/i, "")
    .replace(/^FW:\s*/i, "")
    .replace(/^Fwd:\s*/i, "")
    .replace(/^RE:\s*/i, "")
    .replace(/^Invitation to Bid\s*[-–]\s*/i, "")
    .trim();
}

/** Parse project hints from filename like EXTERNAL_ Oakwood Square Retail (Boynton Beach_ FL) _ Due_ Jun 12_ 2026 _.msg */
export function parseProjectFromFileName(fileName: string): Partial<ParsedProjectFields> {
  const base = fileName.replace(/\.msg$/i, "").trim();
  let name = "";
  let dueDate: string | undefined;

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
  if (name) return { name, dueDate };

  return {};
}

export function extractProjectFromEmail(
  subject: string,
  mainBody: string,
  fileName?: string
): ParsedProjectFields {
  const fromFile = fileName ? parseProjectFromFileName(fileName) : {};
  const cleanedSubject = cleanSubject(subject);

  let name = fromFile.name ?? "";
  let address = "";
  let dueDate = fromFile.dueDate;
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

  const addrPatterns = [
    /(?:Location|Address|Site|Jobsite|Job\s*Site|Project\s*Location)\s*:\s*([^\n]+)/i,
    /(?:located at|at)\s+(\d+[^.\n]{10,80})/i,
  ];
  for (const re of addrPatterns) {
    const m = mainBody.match(re);
    if (m) {
      address = m[1].trim();
      break;
    }
  }

  if (!address) {
    const street = mainBody.match(
      /\b\d+\s+[A-Za-z0-9\s.'-]+(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Way|Ln|Lane|Hwy|Highway)[^,\n]*,?\s*[A-Za-z\s]+,?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/i
    );
    if (street) address = street[0].trim();
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

  return {
    name: name || "Untitled project",
    address,
    dueDate,
    descriptionSnippet,
  };
}
