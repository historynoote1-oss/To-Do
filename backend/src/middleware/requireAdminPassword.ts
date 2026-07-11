import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { comparePassword } from '../lib/auth';
import { AuthRequest } from './verifyUser';

// حماية إضافية (step-up authentication) للإجراءات الخطيرة في لوحة الأدمن:
// حتى لو حد قدر يسرق التوكن بتاع الأدمن (من جهاز مسروق، تسريب، إلخ)،
// مش هيقدر ينفذ حذف/تعليق/إعادة تعيين باسورد من غير ما يكتب كلمة مرور
// الأدمن نفسه في كل مرة. التوكن وحده مش كافي للعمليات دي.
export async function requireAdminPassword(req: AuthRequest, res: Response, next: NextFunction) {
  const { adminPassword } = req.body as { adminPassword?: string };

  if (!adminPassword) {
    return res.status(400).json({ error: 'لازم تأكد بكلمة مرورك عشان تنفذ الإجراء ده' });
  }

  const admin = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { passwordHash: true },
  });

  const valid = admin && (await comparePassword(adminPassword, admin.passwordHash));
  if (!valid) {
    return res.status(403).json({ error: 'كلمة المرور غلط، الإجراء اتلغى' });
  }

  next();
}
