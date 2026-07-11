import { Router } from 'express';
import { getSiteSettings } from '../lib/siteSettings';

const router = Router();

// نقطة عامة (من غير تسجيل دخول) بترجع بس الإعدادات اللي المفروض تظهر لأي
// زائر قبل حتى ما يسجل دخول: هل الموقع تحت الصيانة، الرسالة، الأيقونة،
// واسم الموقع. مفيش أي بيانات حساسة هنا عمدًا.
router.get('/status', async (_req, res) => {
  const settings = await getSiteSettings();
  res.json({
    siteName: settings.siteName,
    maintenanceMode: settings.maintenanceMode === 'true',
    maintenanceMessage: settings.maintenanceMessage,
    maintenanceEmoji: settings.maintenanceEmoji,
    registrationEnabled: settings.registrationEnabled === 'true',
    announcementBanner: settings.announcementBanner,
  });
});

export default router;
