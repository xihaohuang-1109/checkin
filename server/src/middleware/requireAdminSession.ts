import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/client';

declare module 'express-session' {
  interface SessionData {
    adminUserId?: string;
    sessionId?: string;
  }
}

export async function requireAdminSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const adminUserId = req.session?.adminUserId;
  if (!adminUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = getDb();
  const admin = await db.adminUser.findUnique({ where: { id: adminUserId } });
  if (!admin) {
    req.session.destroy(() => {});
    res.status(401).json({ error: 'Admin user not found' });
    return;
  }

  if (!admin.isActive) {
    res.status(403).json({ error: 'Account disabled. Contact super admin.' });
    return;
  }

  next();
}

export async function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const adminUserId = req.session?.adminUserId;
  if (!adminUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = getDb();
  const admin = await db.adminUser.findUnique({ where: { id: adminUserId } });
  if (!admin || !admin.isSuperAdmin) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }

  next();
}