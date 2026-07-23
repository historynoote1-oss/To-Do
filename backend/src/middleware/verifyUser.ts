import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth/auth';
import { prisma } from '../lib/core/prisma';

export interface AuthRequest extends Request {
  userId?: string;
  isAdmin?: boolean;
  mustRehabilitate?: boolean;
}

// بيتحقق من التوكن، وكمان بيراجع القاعدة في كل طلب عشان يتأكد إن الحساب
// لسه مفعّل (مش متعلّق) وإن التوكن ده لسه صالح (مش اتعمله force-logout).
export async function verifyUser(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'لازم تسجل دخول الأول' });
  }
  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, isActive: true, tokenVersion: true, isAdmin: true, mustRehabilitate: true },
    });

    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'الحساب ده متعلّق حاليًا' });
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: 'الجلسة انتهت، سجل دخول تاني' });
    }

    req.userId = user.id;
    req.isAdmin = user.isAdmin;
    req.mustRehabilitate = user.mustRehabilitate;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'الجلسة انتهت، سجل دخول تاني' });
  }
}
