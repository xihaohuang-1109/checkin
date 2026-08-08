import { getDb } from '../db/client';

/**
 * Check if a submission is a "possible duplicate" based on IP + UA + normalized name.
 * This is a SOFT check — it sets a flag, does NOT block submission.
 * IP-based blocking would cause false positives for shared WiFi (common at training venues).
 */
export interface DedupResult {
  possibleDuplicate: boolean;
  matchedSubmissionId?: string;
}

export async function dedupCheck(
  formInstanceId: string,
  deviceId: string,
  ipHash: string,
  userAgent: string,
  normalizedName: string
): Promise<boolean> {
  const db = getDb();

  // Find any existing submission for this instance with matching fingerprint
  // but a different deviceId (same deviceId is already hard-blocked by DB constraint)
  const existing = await db.submission.findFirst({
    where: {
      formInstanceId,
      deviceId: { not: deviceId },
      ipHash,
      userAgent,
    },
  });

  if (!existing) return false;

  // If names also match, very likely duplicate
  if (normalizedName) {
    const existingFields = JSON.parse(existing.submittedFields || '{}');
    const existingName = Object.values(existingFields).find(
      (v) => typeof v === 'string' && v.trim().toLowerCase() === normalizedName
    );
    if (existingName) return true;
  }

  // IP + exact UA match without name match — still flag as possible
  return true;
}