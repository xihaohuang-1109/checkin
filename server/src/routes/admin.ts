import { Router, Request, Response } from 'express';
import { getDb } from '../db/client';
import { requireAdminSession } from '../middleware/requireAdminSession';
import { generateQrAndArchive } from '../services/qrService';
import QRCode from 'qrcode';

const router = Router();

// All admin routes require authentication
router.use(requireAdminSession);

// ============================================================
// FormInstance CRUD
// ============================================================

/**
 * GET /api/admin/form-instances
 * List all form instances
 */
router.get('/form-instances', async (_req: Request, res: Response) => {
  const db = getDb();
  const instances = await db.formInstance.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { submissions: true } } },
  });

  res.json({
    instances: instances.map((i: any) => ({
      id: i.id,
      primaryTitle: i.primaryTitle,
      secondaryTitle: i.secondaryTitle,
      fieldsConfig: JSON.parse(i.fieldsConfig),
      geofenceLat: i.geofenceLat,
      geofenceLng: i.geofenceLng,
      geofenceRadiusM: i.geofenceRadiusM,
      qrToken: i.qrToken,
      qrExpiresAt: i.qrExpiresAt?.toISOString() || null,
      qrStatus: i.qrStatus,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
      submissionCount: i._count.submissions,
    })),
  });
});

/**
 * GET /api/admin/form-instances/:id
 * Get single form instance detail
 */
router.get('/form-instances/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const instance = await db.formInstance.findUnique({
    where: { id },
    include: { _count: { select: { submissions: true } } },
  });

  if (!instance) {
    res.status(404).json({ error: 'Form instance not found' });
    return;
  }

  res.json({
    instance: {
      id: instance.id,
      primaryTitle: instance.primaryTitle,
      secondaryTitle: instance.secondaryTitle,
      fieldsConfig: JSON.parse(instance.fieldsConfig),
      geofenceLat: instance.geofenceLat,
      geofenceLng: instance.geofenceLng,
      geofenceRadiusM: instance.geofenceRadiusM,
      qrToken: instance.qrToken,
      qrExpiresAt: instance.qrExpiresAt?.toISOString() || null,
      qrStatus: instance.qrStatus,
      bitableAppToken: instance.bitableAppToken,
      bitableRecordsTableId: instance.bitableRecordsTableId,
      bitableQrcodesTableId: instance.bitableQrcodesTableId,
      bitableViewId: instance.bitableViewId,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString(),
      submissionCount: instance._count.submissions,
    },
  });
});

/**
 * POST /api/admin/form-instances
 * Create a new form instance
 */
router.post('/form-instances', async (req: Request, res: Response) => {
  const db = getDb();
  const { primaryTitle, secondaryTitle, fieldsConfig, geofenceLat, geofenceLng, geofenceRadiusM } = req.body;

  if (!primaryTitle || !secondaryTitle) {
    res.status(400).json({ error: 'primaryTitle and secondaryTitle are required' });
    return;
  }

  const adminUserId = req.session.adminUserId!;

  const instance = await db.formInstance.create({
    data: {
      primaryTitle,
      secondaryTitle,
      fieldsConfig: JSON.stringify(fieldsConfig || []),
      geofenceLat: geofenceLat || null,
      geofenceLng: geofenceLng || null,
      geofenceRadiusM: geofenceRadiusM || null,
      createdByAdminId: adminUserId,
    },
  });

  res.json({
    instance: {
      id: instance.id,
      primaryTitle: instance.primaryTitle,
      secondaryTitle: instance.secondaryTitle,
      fieldsConfig: JSON.parse(instance.fieldsConfig),
      geofenceLat: instance.geofenceLat,
      geofenceLng: instance.geofenceLng,
      geofenceRadiusM: instance.geofenceRadiusM,
      qrExpiresAt: null,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString(),
    },
  });
});

/**
 * PUT /api/admin/form-instances/:id
 * Update a form instance (fields, geofence, naming)
 */
router.put('/form-instances/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const { primaryTitle, secondaryTitle, fieldsConfig, geofenceLat, geofenceLng, geofenceRadiusM } = req.body;

  const existing = await db.formInstance.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Form instance not found' });
    return;
  }

  const updateData: any = {};
  if (primaryTitle !== undefined) updateData.primaryTitle = primaryTitle;
  if (secondaryTitle !== undefined) updateData.secondaryTitle = secondaryTitle;
  if (fieldsConfig !== undefined) updateData.fieldsConfig = JSON.stringify(fieldsConfig);
  if (geofenceLat !== undefined) updateData.geofenceLat = geofenceLat;
  if (geofenceLng !== undefined) updateData.geofenceLng = geofenceLng;
  if (geofenceRadiusM !== undefined) updateData.geofenceRadiusM = geofenceRadiusM;

  const instance = await db.formInstance.update({
    where: { id },
    data: updateData,
  });

  res.json({
    instance: {
      id: instance.id,
      primaryTitle: instance.primaryTitle,
      secondaryTitle: instance.secondaryTitle,
      fieldsConfig: JSON.parse(instance.fieldsConfig),
      geofenceLat: instance.geofenceLat,
      geofenceLng: instance.geofenceLng,
      geofenceRadiusM: instance.geofenceRadiusM,
      qrToken: instance.qrToken,
      qrExpiresAt: instance.qrExpiresAt?.toISOString() || null,
      qrStatus: instance.qrStatus,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString(),
    },
  });
});

/**
 * DELETE /api/admin/form-instances/:id
 */
router.delete('/form-instances/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;

  const existing = await db.formInstance.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Form instance not found' });
    return;
  }

  await db.submission.deleteMany({ where: { formInstanceId: id } });
  await db.formInstance.delete({ where: { id } });

  res.json({ success: true });
});

// ============================================================
// QR Code Generation
// ============================================================

/**
 * POST /api/admin/form-instances/:id/generate-qr
 * Generate/rotate QR code for a form instance
 */
router.post('/form-instances/:id/generate-qr', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const { validityDays } = req.body;

  if (!validityDays || ![1, 7, 30].includes(validityDays)) {
    res.status(400).json({ error: 'validityDays must be 1, 7, or 30' });
    return;
  }

  const instance = await db.formInstance.findUnique({ where: { id } });
  if (!instance) {
    res.status(404).json({ error: 'Form instance not found' });
    return;
  }

  try {
    const result = await generateQrAndArchive(instance, validityDays);
    res.json(result);
  } catch (err: any) {
    console.error('[QR] Generation failed:', err);
    res.status(500).json({ error: err.message || 'QR generation failed' });
  }
});

/**
 * GET /api/admin/form-instances/:id/qr.png
 * Serve QR code image directly
 */
router.get('/form-instances/:id/qr.png', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;

  const instance = await db.formInstance.findUnique({ where: { id } });
  if (!instance || !instance.qrToken) {
    res.status(404).json({ error: 'QR not generated yet' });
    return;
  }

  const url = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/f/${instance.id}?t=${instance.qrToken}`;

  try {
    const pngBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 512,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(pngBuffer);
  } catch (err) {
    console.error('[QR] PNG generation failed:', err);
    res.status(500).json({ error: 'Failed to generate QR image' });
  }
});

// ============================================================
// Submissions
// ============================================================

/**
 * GET /api/admin/submissions
 * List submissions with optional filters
 */
router.get('/submissions', async (req: Request, res: Response) => {
  const db = getDb();
  const formInstanceId = (req.query.formInstanceId as string) || undefined;
  const syncStatus = (req.query.syncStatus as string) || undefined;
  const possibleDuplicate = (req.query.possibleDuplicate as string) || undefined;

  const where: any = {};
  if (formInstanceId) where.formInstanceId = formInstanceId;
  if (syncStatus) where.syncStatus = syncStatus;
  if (possibleDuplicate === 'true') where.possibleDuplicate = true;

  const submissions = await db.submission.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    include: {
      formInstance: {
        select: { primaryTitle: true, secondaryTitle: true },
      },
    },
    take: 500,
  });

  res.json({
    submissions: submissions.map((s: any) => ({
      id: s.id,
      formInstanceId: s.formInstanceId,
      formInstance: s.formInstance,
      deviceId: s.deviceId,
      submittedFields: JSON.parse(s.submittedFields),
      clientLat: s.clientLat,
      clientLng: s.clientLng,
      clientAccuracy: s.clientAccuracy,
      submittedAt: s.submittedAt.toISOString(),
      syncStatus: s.syncStatus,
      syncError: s.syncError || null,
      possibleDuplicate: s.possibleDuplicate,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

/**
 * POST /api/admin/submissions/:id/toggle-duplicate
 * Toggle possibleDuplicate flag
 */
router.post('/submissions/:id/toggle-duplicate', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;

  const submission = await db.submission.findUnique({ where: { id } });
  if (!submission) {
    res.status(404).json({ error: 'Submission not found' });
    return;
  }

  const updated = await db.submission.update({
    where: { id },
    data: { possibleDuplicate: !submission.possibleDuplicate },
  });

  res.json({
    submission: {
      id: updated.id,
      formInstanceId: updated.formInstanceId,
      deviceId: updated.deviceId,
      submittedFields: JSON.parse(updated.submittedFields),
      submittedAt: updated.submittedAt.toISOString(),
      possibleDuplicate: updated.possibleDuplicate,
      syncStatus: updated.syncStatus,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

// ============================================================
// Bitable Bootstrap
// ============================================================

/**
 * POST /api/admin/bootstrap-bitable
 * Initialize/create the Feishu Bitable using tenant_access_token (app-level).
 * No longer requires user_access_token (no drive:drive user scope needed).
 */
router.post('/bootstrap-bitable', async (req: Request, res: Response) => {
  const db = getDb();

  const existing = await db.appConfig.findUnique({ where: { key: 'bitable_app_token' } });
  if (existing) {
    res.json({ alreadyBootstrapped: true, appToken: existing.value });
    return;
  }

  try {
    const { bootstrapBitable } = await import('../services/feishu/drive');
    const result = await bootstrapBitable();

    await db.appConfig.upsert({
      where: { key: 'bitable_app_token' },
      update: { value: result.appToken },
      create: { key: 'bitable_app_token', value: result.appToken },
    });
    await db.appConfig.upsert({
      where: { key: 'bitable_records_table_id' },
      update: { value: result.recordsTableId },
      create: { key: 'bitable_records_table_id', value: result.recordsTableId },
    });
    await db.appConfig.upsert({
      where: { key: 'bitable_qrcodes_table_id' },
      update: { value: result.qrcodesTableId },
      create: { key: 'bitable_qrcodes_table_id', value: result.qrcodesTableId },
    });

    res.json(result);
  } catch (err: any) {
    console.error('[Bootstrap] Failed:', err);
    res.status(500).json({ error: err.message || 'Bitable bootstrap failed' });
  }
});

/**
 * GET /api/admin/bitable-status
 * Check if Bitable is bootstrapped
 */
router.get('/bitable-status', async (_req: Request, res: Response) => {
  const db = getDb();
  const appToken = await db.appConfig.findUnique({ where: { key: 'bitable_app_token' } });
  const recordsTableId = await db.appConfig.findUnique({ where: { key: 'bitable_records_table_id' } });
  const qrcodesTableId = await db.appConfig.findUnique({ where: { key: 'bitable_qrcodes_table_id' } });

  res.json({
    bootstrapped: !!appToken,
    appToken: appToken?.value || null,
    recordsTableId: recordsTableId?.value || null,
    qrcodesTableId: qrcodesTableId?.value || null,
  });
});

/**
 * POST /api/admin/set-bitable-config
 * Manually configure an existing Bitable (skip auto-bootstrap).
 */
router.post('/set-bitable-config', async (req: Request, res: Response) => {
  const db = getDb();
  const { appToken, recordsTableId, qrcodesTableId } = req.body;

  if (!appToken || !recordsTableId) {
    res.status(400).json({ error: 'appToken and recordsTableId are required' });
    return;
  }

  await db.appConfig.upsert({
    where: { key: 'bitable_app_token' },
    update: { value: appToken },
    create: { key: 'bitable_app_token', value: appToken },
  });
  await db.appConfig.upsert({
    where: { key: 'bitable_records_table_id' },
    update: { value: recordsTableId },
    create: { key: 'bitable_records_table_id', value: recordsTableId },
  });
  if (qrcodesTableId) {
    await db.appConfig.upsert({
      where: { key: 'bitable_qrcodes_table_id' },
      update: { value: qrcodesTableId },
      create: { key: 'bitable_qrcodes_table_id', value: qrcodesTableId },
    });
  }

  res.json({ success: true, appToken, recordsTableId, qrcodesTableId: qrcodesTableId || null });
});

/**
 * POST /api/admin/retry-sync
 * Retry syncing all pending/failed submissions to Bitable
 */
router.post('/retry-sync', async (_req: Request, res: Response) => {
  try {
    const { retryFailedSyncs } = await import('../services/syncQueue');
    const result = await retryFailedSyncs();
    res.json(result);
  } catch (err: any) {
    console.error('[RetrySync] Failed:', err);
    res.status(500).json({ error: err.message || 'Retry sync failed' });
  }
});

export default router;