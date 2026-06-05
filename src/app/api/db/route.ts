import { NextResponse } from "next/server";
import { loadServerDb, saveServerDb } from "@/lib/server-db";
import { normalizeFullDb } from "@/lib/normalize-db";

export async function GET() {
  try {
    const db = await loadServerDb();
    return NextResponse.json(db);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    await saveServerDb(normalizeFullDb(body));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
