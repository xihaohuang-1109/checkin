import { getDb } from '../db/client';
import { getEnv } from '../config/env';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';

/**
 * Generate a new QR code for a form instance.
 * This ROTATES the QR (same instance, new token) — does NOT reset dedup records.
 * QR is only stored locally; no Bitable archival.
 */
export async function generateQrAndArchive(
  instance: any,
  validityDays: number
): Promise<{
  qrToken: string;
  qrExpiresAt: string;
  qrUrl: string;
  pngBase64: string;
}> {
  const db = getDb();
  const env = getEnv();

  // Generate new token
  const qrToken = nanoid(32);
  const qrExpiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

  // Build QR URL
  const qrUrl = `${env.PUBLIC_BASE_URL}/f/${instance.id}?t=${qrToken}`;

  // Generate QR PNG
  const pngBuffer = await QRCode.toBuffer(qrUrl, {
    type: 'png',
    width: 512,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });

  const pngBase64 = pngBuffer.toString('base64');

  // Update local instance
  await db.formInstance.update({
    where: { id: instance.id },
    data: {
      qrToken,
      qrExpiresAt,
      qrStatus: 'active',
    },
  });

  return {
    qrToken,
    qrExpiresAt: qrExpiresAt.toISOString(),
    qrUrl,
    pngBase64,
  };
}