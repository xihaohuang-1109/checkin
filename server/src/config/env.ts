import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (server parent) for shared env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also load server-local .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 chars'),
  FEISHU_APP_ID: z.string().min(1, 'FEISHU_APP_ID is required'),
  FEISHU_APP_SECRET: z.string().min(1, 'FEISHU_APP_SECRET is required'),
  FEISHU_REDIRECT_URI: z.string().url(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (PostgreSQL connection string)'),
  FEISHU_BITABLE_NAME: z.string().default('伙伴赋能培训签到信息表'),
  DEDUP_IP_SALT: z.string().min(8, 'DEDUP_IP_SALT must be at least 8 chars'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('❌ Invalid environment variables:');
      for (const issue of result.error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
      process.exit(1);
    }
    _env = result.data;
  }
  return _env;
}