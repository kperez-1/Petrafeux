import { NextResponse } from "next/server";
import { readAttachmentByKey } from "@/lib/email-attachment-storage";
import { loadServerDb } from "@/lib/server-db";
import { guessMimeType } from "@/lib/email-intake/mime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = await loadServerDb();
    const att = db.emailAttachments.find((a) => a.id === id);
    if (!att) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const buf = att.contentBase64
      ? Buffer.from(att.contentBase64, "base64")
      : await readAttachmentByKey(att.storageKey);
    const mime = att.mimeType || guessMimeType(att.fileName);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(att.fileName)}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
