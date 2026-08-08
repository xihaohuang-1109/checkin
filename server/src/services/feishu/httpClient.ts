import { getEnv } from '../../config/env';

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  token?: string;
}

/**
 * Generic Feishu API HTTP client with auth header injection and retry logic.
 */
export async function feishuRequest<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', headers = {}, body, token } = options;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const url = `${FEISHU_BASE}${path}`;
  const fetchOptions: RequestInit = {
    method,
    headers: reqHeaders,
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  let lastError: Error | null = null;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, fetchOptions);

      // Handle rate limiting
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('x-ogw-ratelimit-reset') || '1', 10);
        const waitMs = Math.max(retryAfter * 1000, 1000);
        console.warn(`[Feishu] Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      const data = await res.json();

      if (!res.ok && res.status >= 500) {
        // Server error, retry with backoff
        console.warn(`[Feishu] Server error ${res.status}, retrying (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        lastError = new Error(`Feishu API ${res.status}: ${JSON.stringify(data)}`);
        continue;
      }

      if (!res.ok) {
        throw new Error(`Feishu API error ${res.status}: ${JSON.stringify(data)}`);
      }

      return data as T;
    } catch (err: any) {
      if (err.message?.includes('Feishu API')) {
        throw err;
      }
      lastError = err;
      console.warn(`[Feishu] Network error, retrying (attempt ${attempt + 1}/${maxRetries}):`, err.message);
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  throw lastError || new Error('Feishu request failed after max retries');
}