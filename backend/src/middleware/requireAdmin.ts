import { Response, NextFunction } from 'express';
import { prisma } from '../lib/core/prisma';
import { AuthRequest } from './verifyUser';

// بيتأكد إن اليوزر أدمن فعليًا عن طريق سؤال قاعدة البيانات مباشرة في كل مرة،
// مش بالاعتماد على أي حاجة مكتوبة جوه الـ JWT token نفسه. كده لو حد قدر (نظريًا)
// يزوّر أو يعدّل توكن قديم، برضو مش هيعديه، لأن الفيصل هو القاعدة مش التوكن.
export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return res.status(403).json({ error: 'الصفحة دي للأدمن بس' });
  }
  next();
}
