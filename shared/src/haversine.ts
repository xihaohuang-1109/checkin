/**
 * Haversine formula to calculate the great-circle distance between two points.
 * Returns distance in meters.
 */
export function haversineDistance(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number }
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Check if a point is within a circular geofence.
 */
export function isWithinGeofence(
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  radiusMeters: number
): boolean {
  return haversineDistance(point, center) <= radiusMeters;
}