import { Vendor } from "./types";
import { geocodeAddress, straightLineMiles } from "./quote-calc";

async function vendorDistanceMiles(
  vendor: Vendor,
  target: { lat: number; lng: number }
): Promise<number> {
  if (typeof vendor.lat === "number" && typeof vendor.lng === "number") {
    return straightLineMiles(target.lat, target.lng, vendor.lat, vendor.lng);
  }
  if (vendor.address.trim()) {
    const coords = await geocodeAddress(vendor.address);
    if (coords) {
      return straightLineMiles(target.lat, target.lng, coords.lat, coords.lng);
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** Quarries/disposal vendors sorted closest to the project (or job) address first */
export async function sortPickupVendorsByProximity(
  vendors: Vendor[],
  projectAddress?: string
): Promise<Vendor[]> {
  const pickupVendors = vendors.filter(
    (v) => v.type === "quarry" || v.type === "disposal"
  );
  if (!projectAddress?.trim()) {
    return [...pickupVendors].sort((a, b) => a.name.localeCompare(b.name));
  }

  const target = await geocodeAddress(projectAddress.trim());
  if (!target) {
    return [...pickupVendors].sort((a, b) => a.name.localeCompare(b.name));
  }

  const withDistance = await Promise.all(
    pickupVendors.map(async (v) => ({
      v,
      miles: await vendorDistanceMiles(v, target),
    }))
  );

  return withDistance
    .sort((a, b) => a.miles - b.miles)
    .map((x) => x.v);
}
