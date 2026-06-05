import { straightLineMiles } from "./quote-calc";

export interface RoadRoute {
  /** Driving miles (or straight-line miles when `approximate`). */
  miles: number;
  /** Polyline as [lat, lng] pairs. */
  geometry: [number, number][];
  /** True when the road route failed and we fell back to a straight line. */
  approximate: boolean;
}

/**
 * Get the driving route between two points via /api/route (OSRM).
 * Falls back to a straight line if routing is unavailable so the UI always
 * has a distance + a line to draw.
 */
export async function fetchRoadRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<RoadRoute> {
  try {
    const res = await fetch(
      `/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`
    );
    if (res.ok) {
      const body = await res.json();
      if (typeof body.miles === "number" && Array.isArray(body.geometry)) {
        return {
          miles: body.miles,
          geometry: body.geometry as [number, number][],
          approximate: false,
        };
      }
    }
  } catch {
    // fall through to straight-line estimate
  }

  const miles = Math.round(straightLineMiles(from.lat, from.lng, to.lat, to.lng) * 10) / 10;
  return {
    miles,
    geometry: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    approximate: true,
  };
}
