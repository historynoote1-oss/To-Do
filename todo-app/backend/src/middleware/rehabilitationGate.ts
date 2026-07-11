import { Response, NextFunction } from 'express';
import { AuthRequest } from './verifyUser';

// طبقة حماية إضافية (defense-in-depth): مسار /auth/login أصلاً مبيدّيش توكن
// دخول كامل لأي حساب لسه mustRehabilitate (بيدّي rehabToken المؤقت بس)، لكن
// لو بأي طريقة فيه توكن قديم صادر قبل تفعيل النظام ده لسه شغال، الميدل وير ده
// بيقفل عليه أي مسار محتاج تسجيل دخول لحد ما يكمّل إعادة التأهيل.
export function rehabilitationGate(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.mustRehabilitate) {
    return res.status(423).json({
      error: 'حسابك لسه محتاج إعادة تأهيل أمني — سجل دخول تاني عشان تكمّل الخطوة',
      requiresRehabilitation: true,
    });
  }
  next();
}
