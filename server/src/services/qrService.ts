import { getDb } from '../db/client';
import { getEnv } from '../config/env';
import { uploadMediaToBitable, createBitableRecord } from './feishu/drive';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';

/**
 * Generate a new QR code for a form instance, upload it to Bitable, and archive.
 * This ROTATES the QR (same instance, new token) — does NOT reset dedup records.
 */
export async function generateQrAndArchive(
  instance: any,
  validityDays: number
): Promise<{
  qrToken: string;
  qrExpiresAt: string;
  qrUrl: string;
  pngBase64: string;
  bitableRecordId?: string;
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

  // Try to archive to Bitable (non-blocking — if Bitable isn't set up yet, we still succeed locally)
  let bitableRecordId: string | undefined;
  try {
    const appTokenConfig = await db.appConfig.findUnique({
      where: { key: 'bitable_app_token' },
    });
    const qrcodesTableConfig = await db.appConfig.findUnique({
      where: { key: 'bitable_qrcodes_table_id' },
    });

    if (appTokenConfig && qrcodesTableConfig) {
      const appToken = appTokenConfig.value;
      const tableId = qrcodesTableConfig.value;

      // Upload QR PNG to Feishu Drive
      const fileToken = await uploadMediaToBitable(
        appToken,
        tableId,
        pngBuffer,
        `qr-${instance.id}-${Date.now()}.png`
      );

      // Create record in 签到码 table
      const recordFields: Record<string, any> = {
        '一级标题': instance.primaryTitle,
        '二级标题': instance.secondaryTitle,
        '生成时间': Math.floor(Date.now()),
        '有效期至': Math.floor(qrExpiresAt.getTime()),
        '二维码': [{ file_token: fileToken }],
        '表单链接': {
          link: qrUrl,
          text: '打开签到表单',
        },
        '状态': '有效',
      };

      bitableRecordId = await createBitableRecord(appToken, tableId, recordFields);
      console.log(`[QR] QR archived to Bitable: ${bitableRecordId}`);
    } else {
      console.warn('[QR] Bitable not bootstrapped, QR not archived to cloud');
    }
  } catch (err: any) {
    console.error('[QR] Failed to archive QR to Bitable:', err.message);
    // Non-fatal — local QR is still valid
  }

  return {
    qrToken,
    qrExpiresAt: qrExpiresAt.toISOString(),
    qrUrl,
    pngBase64,
    bitableRecordId,
  };
}