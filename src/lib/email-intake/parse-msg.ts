import MsgReaderModule from "@kenjiuno/msgreader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MsgReader = (MsgReaderModule as any).default ?? MsgReaderModule;

export interface RawMsgData {
  subject: string;
  senderName: string;
  senderEmail: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt?: string;
  attachments: { fileName: string; content: Buffer }[];
}

function extractEmail(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim().toLowerCase();
}

function extractName(addr: string): string {
  const m = addr.match(/^([^<]+)</);
  if (m) return m[1].replace(/["']/g, "").trim();
  if (addr.includes("@")) return "";
  return addr.trim();
}

export function parseMsgBuffer(buffer: Buffer): RawMsgData {
  const reader = new MsgReader(buffer);
  const data = reader.getFileData();

  const subject = String(data.subject ?? "").trim();
  const senderEmail = extractEmail(String(data.senderEmail ?? data.senderSmtpAddress ?? ""));
  const senderName = String(data.senderName ?? extractName(String(data.senderEmail ?? ""))).trim();

  let bodyText = "";
  let bodyHtml = "";
  if (data.body) bodyText = String(data.body);
  if (data.bodyHTML) bodyHtml = String(data.bodyHTML);
  if (!bodyText && bodyHtml) {
    bodyText = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const attachments: { fileName: string; content: Buffer }[] = [];
  const attMeta = data.attachments ?? [];
  for (let i = 0; i < attMeta.length; i++) {
    const meta = attMeta[i];
    const fileName = String(meta.fileName ?? meta.name ?? `attachment-${i}`);
    try {
      const att = reader.getAttachment(meta);
      const content = att?.content ?? att?.fileContent;
      if (content) {
        attachments.push({
          fileName,
          content: Buffer.isBuffer(content) ? content : Buffer.from(content),
        });
      }
    } catch {
      /* skip broken attachment */
    }
  }

  return {
    subject,
    senderName,
    senderEmail,
    bodyText,
    bodyHtml,
    receivedAt: data.messageDeliveryTime
      ? new Date(data.messageDeliveryTime).toISOString()
      : undefined,
    attachments,
  };
}
