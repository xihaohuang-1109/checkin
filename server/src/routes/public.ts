import { Router, Request, Response } from 'express';
import { getDb } from '../db/client';
import { isWithinGeofence } from '../services/geo';
import type { FieldConfig } from '../types/field';
import { publicSubmitLimiter } from '../middleware/rateLimiter';
import { dedupCheck } from '../services/dedupService';
import { enqueueSync } from '../services/syncQueue';
import crypto from 'crypto';

const router = Router();

/**
 * GET /api/f/:id
 * Get form instance status (config, geofence, whether already submitted by this device)
 */
router.get('/f/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const deviceId = (req.query.deviceId as string) || undefined;
  const token = (req.query.t as string) || undefined;

  const instance = await db.formInstance.findUnique({ where: { id } });

  if (!instance) {
    res.status(404).json({ error: 'Form not found' });
    return;
  }

  // Check QR token validity
  if (instance.qrToken && instance.qrToken !== token) {
    res.status(403).json({ error: 'Invalid QR code' });
    return;
  }

  if (instance.qrExpiresAt && new Date(instance.qrExpiresAt) < new Date()) {
    res.status(410).json({ error: 'QR code has expired', expired: true });
    return;
  }

  // Check if device already submitted
  let alreadySubmitted = false;
  if (deviceId) {
    const existing = await db.submission.findUnique({
      where: {
        formInstanceId_deviceId: {
          formInstanceId: id,
          deviceId,
        },
      },
    });
    alreadySubmitted = !!existing;
  }

  const fieldsConfig: FieldConfig[] = JSON.parse(instance.fieldsConfig || '[]');

  res.json({
    instance: {
      id: instance.id,
      primaryTitle: instance.primaryTitle,
      secondaryTitle: instance.secondaryTitle,
      fieldsConfig,
      geofenceLat: instance.geofenceLat,
      geofenceLng: instance.geofenceLng,
      geofenceRadiusM: instance.geofenceRadiusM,
      qrToken: instance.qrToken,
      qrExpiresAt: instance.qrExpiresAt?.toISOString() || null,
      qrStatus: instance.qrStatus,
      checkinDeadline: instance.checkinDeadline?.toISOString() || null,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString(),
    },
    alreadySubmitted,
    serverTime: new Date().toISOString(),
  });
});

/**
 * POST /api/f/:id/submit
 * Submit check-in form (public, no auth)
 */
router.post('/f/:id/submit', publicSubmitLimiter, async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const { deviceId, fields, clientLat, clientLng, clientAccuracy } = req.body;

  // Validate required fields
  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).json({ success: false, message: 'deviceId is required' });
    return;
  }

  if (!fields || typeof fields !== 'object') {
    res.status(400).json({ success: false, message: 'fields is required' });
    return;
  }

  const instance = await db.formInstance.findUnique({ where: { id } });
  if (!instance) {
    res.status(404).json({ success: false, message: 'Form not found' });
    return;
  }

  // Check expiry
  if (instance.qrExpiresAt && new Date(instance.qrExpiresAt) < new Date()) {
    res.status(410).json({ success: false, message: 'QR code has expired' });
    return;
  }

  // Check dedup
  const existing = await db.submission.findUnique({
    where: {
      formInstanceId_deviceId: {
        formInstanceId: id,
        deviceId,
      },
    },
  });

  if (existing) {
    res.status(409).json({ success: false, alreadySubmitted: true, message: 'Already submitted' });
    return;
  }

  // Validate required fields from config
  const fieldsConfig: FieldConfig[] = JSON.parse(instance.fieldsConfig || '[]');
  const missingRequired: string[] = [];
  for (const field of fieldsConfig) {
    if (field.required && (!fields[field.key] || (fields[field.key] as string).trim() === '')) {
      missingRequired.push(field.label);
    }
  }
  if (missingRequired.length > 0) {
    res.status(400).json({ success: false, missingRequired, message: 'Required fields missing' });
    return;
  }

  // Validate geofence
  if (instance.geofenceLat != null && instance.geofenceLng != null && instance.geofenceRadiusM != null) {
    if (clientLat == null || clientLng == null) {
      res.status(400).json({
        success: false,
        outsideGeofence: true,
        message: 'Location data is required for this check-in',
      });
      return;
    }

    const within = isWithinGeofence(
      { lat: clientLat, lng: clientLng },
      { lat: instance.geofenceLat, lng: instance.geofenceLng },
      instance.geofenceRadiusM
    );

    if (!within) {
      res.status(400).json({
        success: false,
        outsideGeofence: true,
        message: 'You are outside the allowed area',
      });
      return;
    }
  }

  // Soft dedup check (IP + UA + name)
  const ip = (req.ip as string) || req.socket.remoteAddress || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  const ua = (req.headers['user-agent'] as string) || '';
  const nameField = Object.keys(fields).find(
    (k) => k.toLowerCase().includes('name') || k.toLowerCase().includes('姓名')
  );
  const normalizedName = nameField ? (fields[nameField] as string).trim().toLowerCase() : '';

  const possibleDuplicate = await dedupCheck(id, deviceId, ipHash, ua, normalizedName);

  // Determine check-in status based on deadline
  const now = new Date();
  let checkinStatus: string | null = null;
  if (instance.checkinDeadline) {
    checkinStatus = now <= new Date(instance.checkinDeadline) ? 'normal' : 'late';
  }

  try {
    const submission = await db.submission.create({
      data: {
        formInstanceId: id,
        deviceId,
        submittedFields: JSON.stringify(fields),
        clientLat: clientLat || null,
        clientLng: clientLng || null,
        clientAccuracy: clientAccuracy || null,
        submittedAt: now,
        checkinStatus,
        ipHash,
        userAgent: ua.substring(0, 500),
        possibleDuplicate,
        syncStatus: 'pending',
      },
    });

    // Enqueue async sync to Feishu Bitable
    enqueueSync(submission.id).catch((err) => {
      console.error('[SyncQueue] Failed to enqueue:', err);
    });

    res.json({ success: true, message: 'Submitted successfully' });
  } catch (err: any) {
    // Handle unique constraint violation (race condition)
    if (err?.code === 'P2002') {
      res.status(409).json({ success: false, alreadySubmitted: true, message: 'Already submitted' });
      return;
    }
    throw err;
  }
});

export default router;