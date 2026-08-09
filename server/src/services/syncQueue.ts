import { getDb } from '../db/client';
import { createBitableRecord, ensureView, ensureField } from './feishu/drive';
import { getTenantAccessToken } from './feishu/tokenManager';
import { feishuRequest } from './feishu/httpClient';
import type { FieldConfig } from '../types/field';

/**
 * Fetch existing field names from a Bitable table.
 */
async function getExistingFields(appToken: string, tableId: string): Promise<Set<string>> {
  const token = await getTenantAccessToken();
  const res = await feishuRequest<any>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    { token }
  );
  const names = new Set<string>();
  for (const item of (res.data?.items || [])) {
    names.add(item.field_name);
  }
  return names;
}

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

  const instance = submission.formInstance;

  // Get bitable config from the form instance (per-instance)
  const appToken = instance.bitableAppToken;
  const tableId = instance.bitableRecordsTableId;

  if (!appToken || !tableId) {
    // Bitable not configured for this instance; mark as pending, will retry later
    console.warn(`[SyncQueue] No Bitable config for instance ${instance.id}, submission will sync later`);
    return;
  }
  const submittedFields = JSON.parse(submission.submittedFields || '{}');
  const fieldsConfig: FieldConfig[] = JSON.parse(instance.fieldsConfig || '[]');

  try {
    // Ensure all required fields exist in the Bitable table
    const existingFields = await getExistingFields(appToken, tableId);

    // Required system fields
    const requiredFields: Array<{ name: string; type: number }> = [
      { name: '签到时间', type: 5 },
      { name: '签到状态', type: 1 },
      { name: '疑似重复', type: 7 },
    ];

    for (const f of requiredFields) {
      if (!existingFields.has(f.name)) {
        try {
          await ensureField(appToken, tableId, f.name, f.type);
          console.log(`[SyncQueue] Created field "${f.name}" in table ${tableId}`);
        } catch (fieldErr: any) {
          console.warn(`[SyncQueue] Failed to create field "${f.name}": ${fieldErr.message}`);
        }
      }
    }

    // Dynamic fields from form config
    for (const field of fieldsConfig) {
      if (!existingFields.has(field.label)) {
        try {
          const fieldType = field.type === 'select' ? 3 : field.type === 'tel' ? 13 : 1;
          await ensureField(appToken, tableId, field.label, fieldType);
          console.log(`[SyncQueue] Created dynamic field "${field.label}" in table ${tableId}`);
        } catch (fieldErr: any) {
          console.warn(`[SyncQueue] Failed to create dynamic field "${field.label}": ${fieldErr.message}`);
        }
      }
    }

    // Re-fetch fields after creation
    const updatedFields = await getExistingFields(appToken, tableId);

    // Build record fields — only include fields that actually exist in the table
    const recordFields: Record<string, any> = {};

    const addIfExists = (name: string, value: any) => {
      if (updatedFields.has(name)) {
        recordFields[name] = value;
      } else {
        console.warn(`[SyncQueue] Skipping field "${name}" — not found in Bitable table`);
      }
    };

    // Map submitted fields to Bitable column names (using field labels)
    for (const field of fieldsConfig) {
      if (submittedFields[field.key] !== undefined) {
        addIfExists(field.label, submittedFields[field.key]);
      }
    }

    addIfExists('签到时间', Math.floor(new Date(submission.submittedAt).getTime()));
    addIfExists('签到状态', submission.checkinStatus || 'normal');
    addIfExists('疑似重复', submission.possibleDuplicate);

    // Ensure the view exists for this 二级标题
    try {
      const viewId = instance.bitableViewId;
      if (viewId) {
        // View already resolved — just ensure it still exists
        await ensureView(appToken, tableId, instance.secondaryTitle);
      }
    } catch (viewErr: any) {
      console.warn(`[SyncQueue] View ensure failed (non-fatal): ${viewErr.message}`);
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
    const errorMsg = err.message?.substring(0, 500) || 'Unknown error';
    console.error(`[SyncQueue] Failed to sync submission ${submissionId}:`, errorMsg);
    if (err.response) {
      console.error(`[SyncQueue] API response body:`, JSON.stringify(err.response).substring(0, 500));
    }

    await db.submission.update({
      where: { id: submissionId },
      data: {
        syncStatus: 'failed',
        syncError: errorMsg,
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