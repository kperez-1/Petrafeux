import { NextRequest, NextResponse } from "next/server";

interface SendInvoiceBody {
  invoiceId: string;
  recipients: { email: string; name?: string }[];
  message?: string;
  pdfBase64?: string;
}

export async function POST(req: NextRequest) {
  let body: SendInvoiceBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.invoiceId) {
    return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  }
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return NextResponse.json({ error: "At least one recipient required" }, { status: 400 });
  }

  console.log("[invoices/send] simulated send", {
    invoiceId: body.invoiceId,
    recipients: body.recipients.map((r) => r.email),
    hasPdf: Boolean(body.pdfBase64?.length),
  });

  return NextResponse.json({
    ok: true,
    simulated: true,
    invoiceId: body.invoiceId,
    recipientCount: body.recipients.length,
  });
}
