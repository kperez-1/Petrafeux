/**
 * Server-side road routing via OSRM.
 *
 * Uses the public OSRM demo server (car profile). Truck-specific profiles
 * (weight/height/HGV restrictions) would require a provider like
 * OpenRouteService or a self-hosted OSRM with a truck profile — wire that in
 * here later by swapping the upstream call; the response shape can stay the same.
 */

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

const METERS_PER_MILE = 1609.344;

export interface RoadRouteResult {
  /** Driving distance in miles (1 decimal). */
  miles: number;
  /** Polyline as [lat, lng] pairs for map rendering. */
  geometry: [number, number][];
}

interface OsrmResponse {
  code?: string;
  routes?: {
    distance?: number;
    geometry?: { coordinates?: [number, number][] };
  }[];
}

export async function roadRouteServer(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<RoadRouteResult | null> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = (await res.json()) as OsrmResponse;
  const route = json.routes?.[0];
  if (json.code !== "Ok" || !route || typeof route.distance !== "number") return null;

  // OSRM GeoJSON coordinates are [lng, lat]; Leaflet wants [lat, lng].
  const geometry: [number, number][] = (route.geometry?.coordinates ?? []).map(
    ([lng, lat]) => [lat, lng]
  );

  return {
    miles: Math.round((route.distance / METERS_PER_MILE) * 10) / 10,
    geometry,
  };
}
