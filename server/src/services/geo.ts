/**
 * Haversine formula to calculate the great-circle distance between two points.
 * Returns distance in meters.
 */
function haversineDistance(
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
 * Validate that a lat/lng pair is a reasonable coordinate.
 */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Check if a point is within a circular geofence.
 */
export function isWithinGeofence(
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  radiusMeters: number
): boolean {
  if (!isValidCoordinate(point.lat, point.lng)) return false;
  if (!isValidCoordinate(center.lat, center.lng)) return false;
  return haversineDistance(point, center) <= radiusMeters;
}