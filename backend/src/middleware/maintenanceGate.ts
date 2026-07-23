import { Response, NextFunction } from 'express';
import { AuthRequest } from './verifyUser';
import { getSiteSettings } from '../lib/core/siteSettings';

// بيتحط بعد verifyUser على أي مسار محتاج يتقفل وقت الصيانة (قوائم/مهام
// المستخدمين العاديين). الأدمن بيعدي عادي عشان يقدر يدخل يشوف الموقع
// ويلغي وضع الصيانة، حتى وهو شغال.
export async function maintenanceGate(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.isAdmin) return next();

  const settings = await getSiteSettings();
  if (settings.maintenanceMode === 'true') {
    return res.status(503).json({
      error: settings.maintenanceMessage || 'الموقع تحت الصيانة حاليًا',
      maintenance: true,
    });
  }
  next();
}
