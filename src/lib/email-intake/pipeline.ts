import { parseMsgBuffer } from "./parse-msg";
import { extractCustomerFromBody } from "./extract-signature";
import { extractProjectFromEmail } from "./extract-project";
import { buildMatchPreview } from "./match-contractor";
import type { Db } from "../types";
import type { ParsedEmailIntake } from "./types";

export function buildParsedIntake(
  buffer: Buffer,
  fileName: string,
  db: Db
): { parsed: ParsedEmailIntake; matches: ReturnType<typeof buildMatchPreview> } {
  const raw = parseMsgBuffer(buffer);
  const { signature, mainBody, isForwarded, originalSender } = extractCustomerFromBody(
    raw.bodyText,
    { name: raw.senderName, email: raw.senderEmail }
  );

  const project = extractProjectFromEmail(raw.subject, mainBody, fileName);

  const parsed: ParsedEmailIntake = {
    subject: raw.subject,
    from: { name: raw.senderName, email: raw.senderEmail },
    bodyText: raw.bodyText,
    bodyHtml: raw.bodyHtml || undefined,
    signature,
    project,
    isForwarded,
    originalSender,
    attachmentNames: raw.attachments.map((a) => a.fileName),
  };

  return { parsed, matches: buildMatchPreview(db, parsed) };
}

export type { RawMsgData } from "./parse-msg";
export { parseMsgBuffer } from "./parse-msg";
