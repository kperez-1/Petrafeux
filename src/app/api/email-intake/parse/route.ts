import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { buildParsedIntake, parseMsgBuffer } from "@/lib/email-intake/pipeline";
import { writeSessionFile, writeSessionMeta } from "@/lib/email-attachment-storage";
import { loadServerDb } from "@/lib/server-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const fileName = file instanceof File ? file.name : "email.msg";
    if (!fileName.toLowerCase().endsWith(".msg")) {
      return NextResponse.json({ error: "Only .msg files are supported" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const db = await loadServerDb();
    const { parsed, matches } = buildParsedIntake(buffer, fileName, db);
    const raw = parseMsgBuffer(buffer);

    const sessionId = randomUUID();
    await writeSessionFile(sessionId, "email.msg", buffer);
    for (const att of raw.attachments) {
      const safe = att.fileName.replace(/[<>:"/\\|?*]/g, "_");
      await writeSessionFile(sessionId, safe, att.content);
    }

    await writeSessionMeta(sessionId, {
      parsed,
      matches,
      fileName,
      receivedAt: raw.receivedAt,
      attachmentNames: raw.attachments.map((a) => a.fileName.replace(/[<>:"/\\|?*]/g, "_")),
    });

    return NextResponse.json({ sessionId, parsed, matches });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
