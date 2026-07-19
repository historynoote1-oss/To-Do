import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { comparePassword } from '../lib/auth';
import { AuthRequest } from './verifyUser';

// حماية إضافية (step-up authentication) لأي إجراء تدميري نهائي مينفعش
// يترجع على مستوى المستخدم العادي نفسه — زي حذف هدف بكل تبعياته من خريطة
// الأهداف. حتى لو حد قدر يستخدم جهاز المستخدم وهو مسجّل دخول بالفعل (جهاز
// مسروق، جلسة مفتوحة...)، مش هيقدر ينفذ الحذف الجماعي ده من غير ما يعرف
// كلمة مرور الحساب نفسها. نفس فلسفة requireAdminPassword بالظبط بس بتتحقق
// من كلمة مرور المستخدم الحالي نفسه (مش شرط يكون أدمن).
export async function requireAccountPassword(req: AuthRequest, res: Response, next: NextFunction) {
  const { password } = req.body as { password?: string };

  if (!password) {
    return res.status(400).json({ error: 'لازم تأكد بكلمة مرور حسابك عشان تنفذ الحذف ده' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { passwordHash: true },
  });

  const valid = user && (await comparePassword(password, user.passwordHash));
  if (!valid) {
    return res.status(403).json({ error: 'كلمة المرور غلط، عملية الحذف اتلغت' });
  }

  next();
}
