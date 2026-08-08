/**
 * Script to test all Feishu API permissions for the check-in app.
 * Run: npx tsx src/scripts/test-permissions.ts
 */
import { getEnv } from '../config/env';

async function main() {
  const env = getEnv();

  // 1. Get tenant_access_token
  console.log('=== 1. tenant_access_token ===');
  const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
  });
  const tokenData = await tokenRes.json();
  console.log('Code:', tokenData.code, tokenData.msg);
  const token = tokenData.tenant_access_token;
  if (!token) {
    console.error('FAILED to get tenant_access_token. Check App ID/Secret.');
    process.exit(1);
  }
  console.log('✅ Token obtained:', token.substring(0, 20) + '...');
  console.log('');

  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // 2. Test bitable:app - list
  console.log('=== 2. bitable:app (list) ===');
  try {
    const res = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps?page_size=5', { headers });
    const data = await res.json();
    console.log('Code:', data.code, '| Msg:', data.msg);
    if (data.code === 0) {
      console.log('✅ bitable list OK');
      console.log('   Apps count:', data.data?.items?.length || 0);
    } else if (data.code === 99991663) {
      console.log('❌ PERMISSION DENIED: bitable:app scope not granted');
    } else {
      console.log('⚠️  Unexpected:', JSON.stringify(data).substring(0, 200));
    }
  } catch (e: any) {
    console.log('❌ Error:', e.message);
  }
  console.log('');

  // 3. Test bitable:app - create (write permission)
  console.log('=== 3. bitable:app (create) ===');
  try {
    const res = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'permission_test_temp' }),
    });
    const data = await res.json();
    console.log('Code:', data.code, '| Msg:', data.msg);
    if (data.code === 0) {
      console.log('✅ bitable create OK');
      console.log('   App token:', data.data?.app?.app_token);
    } else if (data.code === 99991663) {
      console.log('❌ PERMISSION DENIED: bitable:app write scope not granted');
    } else {
      console.log('⚠️  Unexpected:', JSON.stringify(data).substring(0, 200));
    }
  } catch (e: any) {
    console.log('❌ Error:', e.message);
  }
  console.log('');

  // 4. Test drive:explorer - root folder
  console.log('=== 4. drive:explorer (root folder) ===');
  try {
    const res = await fetch('https://open.feishu.cn/open-apis/drive/explorer/v2/root_folder/meta', { headers });
    const data = await res.json();
    console.log('Code:', data.code, '| Msg:', data.msg);
    if (data.code === 0) {
      console.log('✅ drive explorer OK');
      console.log('   Root folder token:', data.data?.token);
    } else if (data.code === 99991663) {
      console.log('❌ PERMISSION DENIED: drive:explorer scope not granted');
    } else {
      console.log('⚠️  Unexpected:', JSON.stringify(data).substring(0, 200));
    }
  } catch (e: any) {
    console.log('❌ Error:', e.message);
  }
  console.log('');

  // 5. Test drive:drive - media upload
  console.log('=== 5. drive:drive (media upload) ===');
  try {
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(tinyPng)], { type: 'image/png' }), 'test.png');
    formData.append('file_name', 'test.png');
    formData.append('parent_type', 'explorer');
    formData.append('parent_node', '');
    formData.append('size', String(tinyPng.length));
    const res = await fetch('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData,
    });
    const data = await res.json();
    console.log('Code:', data.code, '| Msg:', data.msg);
    if (data.code === 0) {
      console.log('✅ drive media upload OK');
      console.log('   File token:', data.data?.file_token);
    } else if (data.code === 99991663) {
      console.log('❌ PERMISSION DENIED: drive:drive scope not granted');
    } else {
      console.log('⚠️  Unexpected:', JSON.stringify(data).substring(0, 200));
    }
  } catch (e: any) {
    console.log('❌ Error:', e.message);
  }
  console.log('');

  // 6. Test OAuth login URL (doesn't need scope, just verifies app config)
  console.log('=== 6. OAuth login URL (preview) ===');
  const redirectUri = encodeURIComponent(env.FEISHU_REDIRECT_URI);
  const loginUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${env.FEISHU_APP_ID}&redirect_uri=${redirectUri}`;
  console.log('Login URL:', loginUrl);
  console.log('');

  // Summary
  console.log('=== SUMMARY ===');
  console.log('1. tenant_access_token: ✅ Always works with valid App ID/Secret');
  console.log('2. bitable:app (list): check above');
  console.log('3. bitable:app (create): check above');
  console.log('4. drive:explorer: check above');
  console.log('5. drive:drive (upload): check above');
  console.log('6. OAuth login: requires "网页应用" capability + redirect URI configured in console');
  console.log('');
  console.log('If any test shows code 99991663 = PERMISSION DENIED, that scope needs to be manually requested in 飞书开放平台 → 权限管理.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});