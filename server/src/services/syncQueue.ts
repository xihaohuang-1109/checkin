import { getDb } from '../db/client';
import { createBitableRecord, ensureView, ensureField } from './feishu/drive';
import { getTenantAccessToken } from './feishu/tokenManager';
import type { FieldConfig } from '../types/field';

/**
 * Sync a single submission to Feishu Bitable.
 * Called asynchronously after successful local submission.
 */
export async function syncSubmissionToBitable(submissionId: string): Promise<void> {
  const db = getDb();

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: { formInstance: true },
  });

  if (!submission) {
    console.warn(`[SyncQueue] Submission ${submissionId} not found`);
    return;
  }

  // Get bitable config
  const appTokenConfig = await db.appConfig.findUnique({
    where: { key: 'bitable_app_token' },
  });
  const recordsTableConfig = await db.appConfig.findUnique({
    where: { key: 'bitable_records_table_id' },
  });

  if (!appTokenConfig || !recordsTableConfig) {
    // Bitable not bootstrapped yet; mark as pending, will retry later
    console.warn('[SyncQueue] Bitable not bootstrapped, submission will sync later');
    return;
  }

  const appToken = appTokenConfig.value;
  const tableId = recordsTableConfig.value;
  const instance = submission.formInstance;
  const submittedFields = JSON.parse(submission.submittedFields || '{}');
  const fieldsConfig: FieldConfig[] = JSON.parse(instance.fieldsConfig || '[]');

  try {
    // Ensure the view exists for this 一级标题
    await ensureView(appToken, tableId, instance.primaryTitle);

    // Ensure all dynamic fields exist in the Bitable table
    for (const field of fieldsConfig) {
      const fieldType = field.type === 'select' ? 3 : field.type === 'tel' ? 13 : 1;
      await ensureField(appToken, tableId, field.label, fieldType);
    }

    // Build record fields
    const recordFields: Record<string, any> = {
      '一级标题': instance.primaryTitle,
      '二级标题': instance.secondaryTitle,
      '提交时间': Math.floor(new Date(submission.submittedAt).getTime()),
      '疑似重复': submission.possibleDuplicate,
    };

    // Map submitted fields to Bitable column names (using field labels)
    for (const field of fieldsConfig) {
      if (submittedFields[field.key] !== undefined) {
        recordFields[field.label] = submittedFields[field.key];
      }
    }

    // Create record in Bitable
    const recordId = await createBitableRecord(appToken, tableId, recordFields);

    // Mark as synced
    await db.submission.update({
      where: { id: submissionId },
      data: {
        syncStatus: 'synced',
        bitableRecordId: recordId,
        syncError: null,
      },
    });

    console.log(`[SyncQueue] Submission ${submissionId} synced -> Bitable record ${recordId}`);
  } catch (err: any) {
    console.error(`[SyncQueue] Failed to sync submission ${submissionId}:`, err.message);

    await db.submission.update({
      where: { id: submissionId },
      data: {
        syncStatus: 'failed',
        syncError: err.message?.substring(0, 500),
      },
    });
  }
}

/**
 * Retry all failed submissions.
 * Can be called manually or on a schedule.
 */
export async function retryFailedSyncs(): Promise<{ total: number; succeeded: number }> {
  const db = getDb();

  const failed = await db.submission.findMany({
    where: { syncStatus: { in: ['pending', 'failed'] } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  let succeeded = 0;
  for (const sub of failed) {
    await syncSubmissionToBitable(sub.id);
    const updated = await db.submission.findUnique({ where: { id: sub.id } });
    if (updated?.syncStatus === 'synced') succeeded++;
  }

  return { total: failed.length, succeeded };
}

// Simple in-memory queue (no external deps needed)
const pendingQueue: Set<string> = new Set();
let syncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Enqueue a submission for async sync to Bitable.
 * This returns immediately; the sync happens in the background.
 */
export async function enqueueSync(submissionId: string): Promise<void> {
  pendingQueue.add(submissionId);

  // Start the sync worker if not already running
  if (!syncTimer) {
    syncTimer = setInterval(processQueue, 5000);
    syncTimer.unref(); // Don't prevent process exit
  }
}

async function processQueue(): Promise<void> {
  if (pendingQueue.size === 0) return;

  const ids = Array.from(pendingQueue);
  pendingQueue.clear();

  for (const id of ids) {
    try {
      await syncSubmissionToBitable(id);
    } catch (err) {
      console.error(`[SyncQueue] Error processing ${id}:`, err);
    }
  }
}