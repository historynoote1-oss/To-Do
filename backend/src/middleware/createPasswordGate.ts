import { Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { comparePassword } from '../services/auth';
import { AuthRequest } from './verifyUser';

interface PasswordGateOptions {
  // اسم الحقل المتوقع في body (مثلاً "password" أو "adminPassword")
  bodyField: string;
  // الرسائل بتتغير حسب السياق (أدمن ولا مستخدم عادي) فقط، والمنطق واحد
  missingPasswordError: string;
  wrongPasswordError: string;
}

// مصنع واحد لأي middleware بيطلب "تأكيد بكلمة مرور" (step-up authentication)
// قبل تنفيذ إجراء خطير. requireAdminPassword و requireAccountPassword كانا
// نفس المنطق بالحرف الواحد (يقرا كلمة مرور من الـ body، يجيب صاحب التوكن من
// القاعدة، يقارن الباسورد هاش)، فرق بينهم بس اسم الحقل ونصوص الرسائل.
export function createPasswordGate({ bodyField, missingPasswordError, wrongPasswordError }: PasswordGateOptions) {
  return async function passwordGate(req: AuthRequest, res: Response, next: NextFunction) {
    const password = (req.body as Record<string, string | undefined>)[bodyField];

    if (!password) {
      return res.status(400).json({ error: missingPasswordError });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { passwordHash: true },
    });

    const valid = user && (await comparePassword(password, user.passwordHash));
    if (!valid) {
      return res.status(403).json({ error: wrongPasswordError });
    }

    next();
  };
}
