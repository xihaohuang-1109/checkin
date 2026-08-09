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
 * Only creates the Bitable app — tables are created per-form-instance.
 */
export async function bootstrapBitable(_userAccessToken?: string): Promise<{
  appToken: string;
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

  return { appToken };
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

  console.log(`[Bitable] Creating record in table=${tableId} with fields=${JSON.stringify(fields)}`);

  const data = await feishuRequest<any>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      token,
      body: { fields },
    }
  );

  if (data.code !== 0) {
    throw new Error(`Create record failed (code=${data.code}): ${data.msg}`);
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
  return createView(appToken, tableId, primaryTitle, token);
}

async function createView(
  appToken: string,
  tableId: string,
  viewName: string,
  token: string
): Promise<string> {
  const createRes = await feishuRequest<CreateViewResponse>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/views`,
    {
      method: 'POST',
      token,
      body: {
        view_name: viewName,
        view_type: 'grid',
      },
    }
  );

  if (createRes.code !== 0) {
    throw new Error(`Failed to create view "${viewName}": ${createRes.msg}`);
  }

  const viewId = createRes.data.view.view_id;

  // Set filter: 一级标题 == viewName
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
              value: [viewName],
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
 * Create a new table in the Bitable app.
 * Returns the table_id.
 */
export async function createTable(
  appToken: string,
  tableName: string
): Promise<string> {
  const token = await getTenantAccessToken();

  const createRes = await feishuRequest<CreateTableResponse>(
    `/bitable/v1/apps/${appToken}/tables`,
    {
      method: 'POST',
      token,
      body: {
        table: {
          name: tableName,
        },
      },
    }
  );

  if (createRes.code !== 0) {
    throw new Error(`Failed to create table "${tableName}": ${createRes.msg}`);
  }

  return createRes.data.table_id;
}

/**
 * Resolve or create a table and view for a form instance.
 *
 * 一级标题 → table name: find existing table by name, or create a new one.
 * 二级标题 → view name: find existing view within that table, or create a new one.
 * When creating a new table, adds fixed fields + dynamic fields from fieldsConfig.
 *
 * Returns { tableId, viewId } for storage on the FormInstance.
 */
export async function resolveTableAndView(
  appToken: string,
  primaryTitle: string,
  secondaryTitle: string,
  fieldsConfig?: Array<{ label: string; type: string }>
): Promise<{ tableId: string; viewId: string }> {
  const token = await getTenantAccessToken();

  // 1. List tables, find by name (一级标题)
  const tablesRes = await feishuRequest<TablesResponse>(
    `/bitable/v1/apps/${appToken}/tables`,
    { token }
  );

  let tableId: string;
  const existingTable = tablesRes.data?.items?.find(
    (t) => t.name === primaryTitle
  );

  if (existingTable) {
    tableId = existingTable.table_id;
    console.log(`[TableResolve] Found existing table "${primaryTitle}": ${tableId}`);
  } else {
    tableId = await createTable(appToken, primaryTitle);
    console.log(`[TableResolve] Created table "${primaryTitle}": ${tableId}`);

    // Add fixed fields
    const fixedFields = [
      { field_name: '一级标题', type: 1 },
      { field_name: '二级标题', type: 1 },
      { field_name: '签到时间', type: 5 },
      { field_name: '签到状态', type: 1 },
      { field_name: '疑似重复', type: 7 },
    ];

    for (const field of fixedFields) {
      try {
        await ensureField(appToken, tableId, field.field_name, field.type);
      } catch (err) {
        console.warn(`[TableResolve] Field "${field.field_name}" may already exist:`, err);
      }
    }

    // Add dynamic fields from form config
    if (fieldsConfig && fieldsConfig.length > 0) {
      for (const field of fieldsConfig) {
        if (field.label) {
          try {
            const fieldType =
              field.type === 'select' ? 3 :
              field.type === 'tel' ? 13 :
              field.type === 'email' ? 1 :
              1; // default: text
            await ensureField(appToken, tableId, field.label, fieldType);
            console.log(`[TableResolve] Created dynamic field "${field.label}" (type=${fieldType})`);
          } catch (err) {
            console.warn(`[TableResolve] Field "${field.label}" may already exist:`, err);
          }
        }
      }
    }
  }

  // 2. List views, find by name (二级标题)
  const viewsRes = await feishuRequest<any>(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/views`,
    { token }
  );

  let viewId: string;
  const existingView = viewsRes.data?.items?.find(
    (v: any) => v.view_name === secondaryTitle
  );

  if (existingView) {
    viewId = existingView.view_id;
    console.log(`[ViewResolve] Found existing view "${secondaryTitle}": ${viewId}`);
  } else {
    viewId = await createView(appToken, tableId, secondaryTitle, token);
    console.log(`[ViewResolve] Created view "${secondaryTitle}": ${viewId}`);
  }

  return { tableId, viewId };
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