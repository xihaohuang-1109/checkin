import { getEnv } from '../../config/env';
import { getDb } from '../../db/client';
import { feishuRequest } from './httpClient';

interface TenantTokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number; // seconds
}

let cachedToken: string | null = null;
let cachedExpiresAt: number = 0;

/**
 * Get tenant_access_token (app-level).
 * Cached in memory; refreshed automatically.
 * Used for all Bitable read/write operations after initial bootstrap.
 */
export async function getTenantAccessToken(): Promise<string> {
  // Check memory cache
  if (cachedToken && Date.now() < cachedExpiresAt - 60_000) {
    return cachedToken!;
  }

  // Check DB cache
  const db = getDb();
  const dbCache = await db.appConfig.findUnique({
    where: { key: 'tenant_access_token_cache' },
  });

  if (dbCache?.value) {
    try {
      const parsed = JSON.parse(dbCache.value);
      if (typeof parsed.token === 'string' && parsed.expiresAt > Date.now() + 60_000) {
        cachedToken = parsed.token;
        cachedExpiresAt = parsed.expiresAt;
        return cachedToken!;
      }
    } catch { /* stale cache, refresh */ }
  }

  // Fetch new token
  const env = getEnv();
  const data = await feishuRequest<TenantTokenResponse>(
    '/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      body: {
        app_id: env.FEISHU_APP_ID,
        app_secret: env.FEISHU_APP_SECRET,
      },
    }
  );

  if (data.code !== 0) {
    throw new Error(`Failed to get tenant_access_token: ${data.msg}`);
  }

  cachedToken = data.tenant_access_token;
  cachedExpiresAt = Date.now() + data.expire * 1000;

  // Persist to DB for cold start
  await db.appConfig.upsert({
    where: { key: 'tenant_access_token_cache' },
    update: {
      value: JSON.stringify({
        token: cachedToken,
        expiresAt: cachedExpiresAt,
      }),
    },
    create: {
      key: 'tenant_access_token_cache',
      value: JSON.stringify({
        token: cachedToken,
        expiresAt: cachedExpiresAt,
      }),
    },
  });

  return cachedToken!;
}

/**
 * Invalidate the cached tenant_access_token (used on auth errors).
 */
export function invalidateTenantToken(): void {
  cachedToken = null;
  cachedExpiresAt = 0;
}