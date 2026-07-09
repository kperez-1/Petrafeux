import { NextRequest, NextResponse } from "next/server";

interface SendQuoteBody {
  quoteId: string;
  recipients: { email: string; name?: string; contactId?: string }[];
  message?: string;
  pdfBase64?: string;
}

export async function POST(req: NextRequest) {
  let body: SendQuoteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.quoteId) {
    return NextResponse.json({ error: "quoteId required" }, { status: 400 });
  }
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return NextResponse.json({ error: "At least one recipient required" }, { status: 400 });
  }

  const invalid = body.recipients.find((r) => !r.email?.trim());
  if (invalid) {
    return NextResponse.json({ error: "All recipients need an email" }, { status: 400 });
  }

  // Stub: real email delivery (Cloudflare Email Sending / Resend) wired later.
  console.log("[quotes/send] simulated send", {
    quoteId: body.quoteId,
    recipients: body.recipients.map((r) => r.email),
    hasPdf: Boolean(body.pdfBase64?.length),
    messageLength: body.message?.length ?? 0,
  });

  return NextResponse.json({
    ok: true,
    simulated: true,
    quoteId: body.quoteId,
    recipientCount: body.recipients.length,
  });
}
