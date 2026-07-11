import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth';

export interface AuthRequest extends Request {
  userId?: string;
}

// بيتحقق من الـ JWT token اللي بيبعته الفرونت إند مع كل طلب بعد تسجيل الدخول
export function verifyUser(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'لازم تسجل دخول الأول' });
  }
  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'الجلسة انتهت، سجل دخول تاني' });
  }
}
