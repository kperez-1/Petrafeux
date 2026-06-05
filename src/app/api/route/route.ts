import { NextRequest, NextResponse } from "next/server";
import { roadRouteServer } from "@/lib/routing-server";

function parsePair(value: string | null): { lat: number; lng: number } | null {
  if (!value) return null;
  const [latStr, lngStr] = value.split(",");
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng };
}

export async function GET(request: NextRequest) {
  const from = parsePair(request.nextUrl.searchParams.get("from"));
  const to = parsePair(request.nextUrl.searchParams.get("to"));

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to (lat,lng) required" },
      { status: 400 }
    );
  }

  try {
    const result = await roadRouteServer(from, to);
    if (!result) {
      return NextResponse.json({ error: "no_route" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
