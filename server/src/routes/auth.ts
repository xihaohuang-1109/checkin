import { Router, Request, Response } from 'express';
import { getEnv } from '../config/env';
import { getDb } from '../db/client';
import { setCsrfCookie } from '../middleware/csrf';
import crypto from 'crypto';

const router = Router();

/**
 * GET /api/auth/feishu/login
 * Redirect to Feishu OAuth authorization page (scan-to-login)
 */
router.get('/feishu/login', (_req: Request, res: Response) => {
  const env = getEnv();
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = encodeURIComponent(env.FEISHU_REDIRECT_URI);

  const authUrl =
    `https://open.feishu.cn/open-apis/authen/v1/authorize` +
    `?app_id=${env.FEISHU_APP_ID}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${state}`;

  // Store state in session for CSRF protection
  (_req as any).session.feishuOauthState = state;

  res.redirect(authUrl);
});

/**
 * GET /api/auth/feishu/callback
 * Feishu OAuth callback: exchange code for user_access_token, identify admin
 */
router.get('/feishu/callback', async (req: Request, res: Response) => {
  const env = getEnv();
  const db = getDb();
  const { code, state } = req.query;

  // Verify state
  const storedState = (req as any).session?.feishuOauthState;
  if (!state || state !== storedState) {
    res.status(400).json({ error: 'Invalid OAuth state' });
    return;
  }
  delete (req as any).session.feishuOauthState;

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    // First get app_access_token (needed to exchange the auth code)
    const appTokenRes = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: env.FEISHU_APP_ID,
          app_secret: env.FEISHU_APP_SECRET,
        }),
      }
    );
    const appTokenData = await appTokenRes.json();
    if (appTokenData.code !== 0 || !appTokenData.app_access_token) {
      console.error('[Feishu OAuth] Failed to get app_access_token:', JSON.stringify(appTokenData));
      res.status(500).json({ error: 'Failed to get app access token' });
      return;
    }
    const appAccessToken = appTokenData.app_access_token;

    // Exchange code for user_access_token (requires app_access_token as Bearer)
    const tokenRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appAccessToken}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
        }),
      }
    );

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.code !== 0) {
      console.error('[Feishu OAuth] token exchange response:', JSON.stringify(tokenData));
      res.status(500).json({ error: 'Failed to exchange token: ' + (tokenData.msg || tokenRes.statusText) });
      return;
    }

    const userAccessToken = tokenData.data?.access_token;
    const refreshToken = tokenData.data?.refresh_token;
    const expiresIn = tokenData.data?.expires_in || 7200;

    if (!userAccessToken) {
      res.status(500).json({ error: 'No access token received from Feishu' });
      return;
    }

    // Get user info
    const userRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
        },
      }
    );

    if (!userRes.ok) {
      console.error('[Feishu OAuth] user info failed:', await userRes.text());
      res.status(500).json({ error: 'Failed to get user info from Feishu' });
      return;
    }

    const userData = await userRes.json();
    const userInfo = userData.data;

    // Upsert admin user
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Check if this is the first admin ever (becomes super admin)
    const adminCount = await db.adminUser.count();
    const isFirstAdmin = adminCount === 0;

    const admin = await db.adminUser.upsert({
      where: { feishuOpenId: userInfo.open_id },
      update: {
        feishuUnionId: userInfo.union_id || null,
        name: userInfo.name || null,
        avatarUrl: userInfo.avatar_url || userInfo.avatar_thumb || null,
        userAccessTokenEnc: userAccessToken,
        refreshTokenEnc: refreshToken || null,
        tokenExpiresAt,
      },
      create: {
        feishuOpenId: userInfo.open_id,
        feishuUnionId: userInfo.union_id || null,
        name: userInfo.name || null,
        avatarUrl: userInfo.avatar_url || userInfo.avatar_thumb || null,
        userAccessTokenEnc: userAccessToken,
        refreshTokenEnc: refreshToken || null,
        tokenExpiresAt,
        isSuperAdmin: isFirstAdmin,
        isActive: true,
      },
    });

    // Set session
    (req as any).session.adminUserId = admin.id;

    // Set CSRF cookie
    setCsrfCookie(req, res);

    // Redirect to admin dashboard
    const adminUrl = `${env.PUBLIC_BASE_URL}/admin`;
    res.redirect(adminUrl);
  } catch (err) {
    console.error('[Feishu OAuth] unexpected error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * GET /api/auth/me
 * Return current admin user info
 */
router.get('/me', async (req: Request, res: Response) => {
  const adminUserId = (req as any).session?.adminUserId;
  if (!adminUserId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const db = getDb();
  const admin = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      feishuOpenId: true,
      isSuperAdmin: true,
      isActive: true,
    },
  });

  if (!admin) {
    res.status(401).json({ error: 'Admin not found' });
    return;
  }

  res.json({ admin });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.clearCookie('csrf-token');
    res.json({ success: true });
  });
});

export default router;