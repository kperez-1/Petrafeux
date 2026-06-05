import { NextResponse } from "next/server";
import { applyEmailIntake, mergeApplyIntoDb } from "@/lib/email-intake/apply-intake";
import { generateId } from "@/lib/utils";
import type { IntakeApplyPayload } from "@/lib/email-intake/types";
import { guessMimeType } from "@/lib/email-intake/mime";
import {
  promoteSessionAttachments,
  readSessionMeta,
  removeSession,
} from "@/lib/email-attachment-storage";
import { loadServerDb, saveServerDb } from "@/lib/server-db";

export const runtime = "nodejs";

interface SessionMeta {
  parsed: import("@/lib/email-intake/types").ParsedEmailIntake;
  matches: import("@/lib/email-intake/types").IntakeMatchPreview;
  fileName: string;
  receivedAt?: string;
  attachmentNames: string[];
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as IntakeApplyPayload;
    if (!payload.sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const meta = await readSessionMeta<SessionMeta>(payload.sessionId);
    if (!meta?.parsed) {
      return NextResponse.json({ error: "Session expired or not found" }, { status: 404 });
    }

    const db = await loadServerDb();
    const result = applyEmailIntake(db, meta.parsed, payload, [], meta.receivedAt);

    const promoted = await promoteSessionAttachments(
      payload.sessionId,
      result.project.id,
      result.intake.id,
      meta.attachmentNames
    );

    const attachments = promoted.map((p) => ({
      id: generateId(),
      intakeId: result.intake.id,
      projectId: result.project.id,
      fileName: p.fileName,
      mimeType: guessMimeType(p.fileName),
      size: p.size,
      storageKey: p.storageKey,
      contentBase64: p.contentBase64,
    }));

    const finalResult = {
      ...result,
      attachments,
      intake: {
        ...result.intake,
        attachmentIds: attachments.map((a) => a.id),
      },
    };

    const nextDb = mergeApplyIntoDb(db, finalResult);
    await saveServerDb(nextDb);
    await removeSession(payload.sessionId);

    return NextResponse.json({
      projectId: finalResult.project.id,
      intakeId: finalResult.intake.id,
      createdProject: finalResult.createdProject,
      createdContractor: finalResult.createdContractor,
      project: finalResult.project,
      contractor: finalResult.contractor,
      intake: finalResult.intake,
      attachments: finalResult.attachments,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
