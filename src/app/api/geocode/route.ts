import { NextRequest, NextResponse } from "next/server";
import { geocodeAddressServer } from "@/lib/geocode-server";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim() ?? "";
  const latParam = request.nextUrl.searchParams.get("lat");
  const lngParam = request.nextUrl.searchParams.get("lng");

  if (latParam != null && lngParam != null) {
    const lat = parseFloat(latParam);
    const lng = parseFloat(lngParam);
    if (isFinite(lat) && isFinite(lng)) {
      return NextResponse.json({ lat, lng, source: "params" });
    }
  }

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  try {
    const result = await geocodeAddressServer(address);

    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({
      lat: result.lat,
      lng: result.lng,
      source: result.source,
      approximate: result.source === "city_approx",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
