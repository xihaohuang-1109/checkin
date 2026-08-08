import { getEnv } from '../../config/env';
import { getDb } from '../../db/client';
import { feishuRequest } from './httpClient';
import { getTenantAccessToken } from './tokenManager';

const BITABLE_NAME = '伙伴赋能培训签到信息表';

interface BitableCreateResponse {
  code: number;
  msg: string;
  data: {
    app: {
      app_token: string;
    };
  };
}

interface RootFolderResponse {
  code: number;
  msg: string;
  data: {
    token: string;
  };
}

interface TablesResponse {
  code: number;
  msg: string;
  data: {
    items: Array<{ table_id: string; name: string }>;
  };
}

interface CreateTableResponse {
  code: number;
  msg: string;
  data: {
    table_id: string;
  };
}

interface CreateFieldResponse {
  code: number;
  msg: string;
  data: {
    field: { field_id: string };
  };
}

interface CreateViewResponse {
  code: number;
  msg: string;
  data: {
    view: { view_id: string };
  };
}

/**
 * Get the root folder token of the admin's personal drive ("我的空间").
 * Must be called with the admin's user_access_token.
 */
export async function getRootFolderToken(userAccessToken: string): Promise<string> {
  const data = await feishuRequest<RootFolderResponse>(
    '/drive/explorer/v2/root_folder/meta',
    { token: userAccessToken }
  );

  if (data.code !== 0) {
    throw new Error(`Failed to get root folder: ${data.msg}`);
  }

  return data.data.token;
}

/**
 * Bootstrap: create the Bitable using tenant_access_token (app-level).
 * Uses tenant_access_token instead of user_access_token to avoid needing
 * drive:drive user authorization. The Bitable is created in the app's space
 * rather than the admin's personal "我的空间", but is fully functional.
 * Called once (idempotent) via admin API.
 */
export async function bootstrapBitable(_userAccessToken?: string): Promise<{
  appToken: string;
  recordsTableId: string;
  qrcodesTableId: string;
}> {
  const token = await getTenantAccessToken();

  // 1. Create Bitable app (no folder_token — creates in app's default space)
  console.log(`[Bootstrap] Creating Bitable "${BITABLE_NAME}"...`);
  const createRes = await feishuRequest<BitableCreateResponse>(
    '/bitable/v1/apps',
    {
      method: 'POST',
      token,
      body: {
        name: BITABLE_NAME,
      },
    }
  );

  if (createRes.code !== 0) {
    throw new Error(`Failed to create Bitable: ${createRes.msg}`);
  }

  const appToken = createRes.data.app.app_token;
  console.log(`[Bootstrap] Bitable created: ${appToken}`);

  // 2. Create "签到记录" table
  const recordsTableId = await createRecordsTable(appToken, token);
  console.log(`[Bootstrap] Records table: ${recordsTableId}`);

  // 3. Create "签到码" table
  const qrcodesTableId = await createQrcodesTable(appToken, token);
  console.log(`[Bootstrap] QR codes table: ${qrcodesTableId}`);

  return { appToken, recordsTableId, qrcodesTableId };
}

/**
 * Create the "签到记录" (check-in records) table with fixed fields.
 */
async function createRecordsTable(appToken: string, token: string): Promise<string> {
  // Check if table exists
  const tablesRes = await feishuRequest<TablesResponse>(
    `/bitable/v1/apps/${appToken}/tables`,
    { token }
  );

  const existing = tablesRes.data?.items?.find((t) => t.name === '签到记录');
  if (existing) return existing.table_id;

  const createRes = await feishuRequest<CreateTableResponse>(
    `/bitable/v1/apps/${appToken}/tables`,
    {
      method: 'POST',
      token,
      body: {
        table: {
          name: '签到记录',
        },
      },
    }
  );

  if (createRes.code !== 0) {
    throw new Error(`Failed to create records table: ${createRes.msg}`);
  }

  const tableId = createRes.data.table_id;

  // Add fixed fields to the table
  const fixedFields = [
    { field_name: '一级标题', type: 1 },   // 1 = text
    { field_name: '二级标题', type: 1 },   // 1 = text
    { field_name: '提交时间', type: 5 },   // 5 = datetime
    { field_name: '疑似重复', type: 7 },   // 7 = checkbox
  ];

  for (const field of fixedFields) {
    try {
      await feishuRequest<CreateFieldResponse>(
        `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
        {
          method: 'POST',
          token,
          body: { field_name: field.field_name, type: field.type },
        }
      );
    } catch (err) {
      console.warn(`[Bootstrap] Field "${field.field_name}" may already exist:`, err);
    }
  }

  return tableId;
}

/**
 * Create the "签到码" (QR codes) table with fixed fields.
 */
async function createQrcodesTable(appToken: string, token: string): Promise<string> {
  const tablesRes = await feishuRequest<TablesResponse>(
    `/bitable/v1/apps/${appToken}/tables`,
    { token }
  );

  const existing = tablesRes.data?.items?.find((t) => t.name === '签到码');
  if (existing) return existing.table_id;

  const createRes = await feishuRequest<CreateTableResponse>(
    `/bitable/v1/apps/${appToken}/tables`,
    {
      method: 'POST',
      token,
      body: {
        table: {
          name: '签到码',
        },
      },
    }
  );

  if (createRes.code !== 0) {
    throw new Error(`Failed to create QR codes table: ${createRes.msg}`);
  }

  const tableId = createRes.data.table_id;

  const fixedFields = [
    { field_name: '一级标题', type: 1 },
    { field_name: '二级标题', type: 1 },
    { field_name: '生成时间', type: 5 },
    { field_name: '有效期至', type: 5 },
    { field_name: '二维码', type: 17 },    // 17 = attachment
    { field_name: '表单链接', type: 15 },  // 15 = URL
    { field_name: '状态', type: 3 },       // 3 = single select
  ];

  for (const field of fixedFields) {
    try {
      await feishuRequest<CreateFieldResponse>(
        `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
        {
          method: 'POST',
          token,
          body: { field_name: field.field_name, type: field.type },
        }
      );
    } catch (err) {
      console.warn(`[Bootstrap] Field "${field.field_name}" may already exist:`, err);
    }
  }

  return tableId;
}

/**
 * Upload media (QR code PNG) to Feishu Drive for use in Bitable attachment field.
 * Returns the file_token.
 */
export async function uploadMediaToBitable(
  appToken: string,
  tableId: string,
  pngBuffer: Buffer,
  filename: string
): Promise<string> {
  const token = await getTenantAccessToken();

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' });
  formData.append('file', blob, filename);
  formData.append('file_name', filename);
  formData.append('parent_type', 'bitable_file');
  formData.append('parent_node', appToken);
  formData.append('size', String(pngBuffer.length));

  const res = await fetch(
    'https://open.feishu.cn/open-apis/drive/v1/medias/upload_all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Media upload failed: ${data.msg}`);
  }

  return data.data.file_token;
}

/**
 * Create a record in Bitable.
 */
export async function createBitableRecord(
  appToken: string,
  tableId: string,
  fields: Record<string, any>
): Promise<string> {
  const token = await getTenantAccessToken();

  const data = await feishuRequest<any>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      token,
      body: { fields },
    }
  );

  if (data.code !== 0) {
    throw new Error(`Create record failed: ${data.msg}`);
  }

  return data.data.record.record_id;
}

/**
 * Ensure a view exists for a given 一级标题.
 * If not, create a filtered view (only rows with this primary title).
 */
export async function ensureView(
  appToken: string,
  tableId: string,
  primaryTitle: string
): Promise<string> {
  const token = await getTenantAccessToken();

  // List existing views
  const viewsRes = await feishuRequest<any>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/views`,
    { token }
  );

  const existing = viewsRes.data?.items?.find(
    (v: any) => v.view_name === primaryTitle
  );
  if (existing) return existing.view_id;

  // Create new view
  const createRes = await feishuRequest<CreateViewResponse>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/views`,
    {
      method: 'POST',
      token,
      body: {
        view_name: primaryTitle,
        view_type: 'grid',
      },
    }
  );

  if (createRes.code !== 0) {
    throw new Error(`Failed to create view "${primaryTitle}": ${createRes.msg}`);
  }

  const viewId = createRes.data.view.view_id;

  // Set filter: 一级标题 == primaryTitle
  await feishuRequest<any>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/views/${viewId}`,
    {
      method: 'PATCH',
      token,
      body: {
        filter_info: {
          conjunction: 'and',
          conditions: [
            {
              field_name: '一级标题',
              operator: 'is',
              value: [primaryTitle],
            },
          ],
        },
        sort_info: {
          sort_fields: [
            { field_name: '二级标题', desc: false },
          ],
        },
      },
    }
  );

  return viewId;
}

/**
 * Ensure a field exists in the records table. Creates it if not found.
 * Used for dynamic union-schema — each unique field key from admin configs
 * gets a column in the records table.
 */
export async function ensureField(
  appToken: string,
  tableId: string,
  fieldName: string,
  fieldType: number = 1
): Promise<void> {
  const token = await getTenantAccessToken();

  // List existing fields
  const fieldsRes = await feishuRequest<any>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    { token }
  );

  const existing = fieldsRes.data?.items?.find(
    (f: any) => f.field_name === fieldName
  );
  if (existing) return;

  await feishuRequest<CreateFieldResponse>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      method: 'POST',
      token,
      body: { field_name: fieldName, type: fieldType },
    }
  );
}