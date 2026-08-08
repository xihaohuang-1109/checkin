import { getDb } from '../db/client';
import { ensureField } from './feishu/drive';
import type { FieldConfig } from '../types/field';

/**
 * Ensure the Bitable records table has columns for all fields defined in a FormInstance.
 * Called when admin saves/updates field config.
 * Uses union-schema: all fields ever defined across all instances share the same table.
 */
export async function ensureBitableFieldsForInstance(
  appToken: string,
  tableId: string,
  fieldsConfig: FieldConfig[]
): Promise<void> {
  for (const field of fieldsConfig) {
    // Map field type to Bitable field type code
    const fieldType = mapFieldType(field.type);
    await ensureField(appToken, tableId, field.label, fieldType);
  }
}

/**
 * Map our logical field type to Feishu Bitable field type code.
 *
 * Bitable field type codes (verify against current docs):
 * 1  = 多行文本 (Text)
 * 2  = 数字 (Number)
 * 3  = 单选 (Single Select)
 * 4  = 多选 (Multi Select)
 * 5  = 日期 (DateTime)
 * 7  = 复选框 (Checkbox)
 * 13 = 电话号码 (Phone)
 * 15 = 超链接 (URL)
 * 17 = 附件 (Attachment)
 */
function mapFieldType(type: string): number {
  switch (type) {
    case 'select':
      return 3; // Single select
    case 'tel':
      return 13; // Phone
    case 'email':
      return 1; // Text (no dedicated email type)
    case 'text':
    default:
      return 1; // Text
  }
}