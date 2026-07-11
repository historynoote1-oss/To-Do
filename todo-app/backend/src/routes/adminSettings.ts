import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { requireAdminPassword } from '../middleware/requireAdminPassword';
import { SITE_SETTINGS_DEFAULTS, invalidateSiteSettingsCache } from '../lib/siteSettings';

const router = Router();

// القيم الافتراضية لكل إعداد — مصدرها الموحّد lib/siteSettings.ts، عشان
// middleware الصيانة والـ route العام (site.ts) يستخدموا نفس الافتراضيات
// بالظبط من غير تكرار.
const DEFAULTS = SITE_SETTINGS_DEFAULTS;

router.get('/', async (_req, res) => {
  const rows = await prisma.siteSetting.findMany();
  const map: Record<string, string> = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  res.json({ settings: map });
});

// تحديث إعداد أو أكتر دفعة واحدة — إجراء حساس (بيأثر على الموقع كله) فمحتاج
// تأكيد بكلمة مرور الأدمن زي أي عملية خطيرة تانية في اللوحة.
router.put('/', requireAdminPassword, async (req: AuthRequest, res) => {
  const { settings } = req.body as { settings?: Record<string, string> };
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'بيانات الإعدادات ناقصة' });
  }

  const admin = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });

  const entries = Object.entries(settings).filter(([key]) => key in DEFAULTS);
  await Promise.all(
    entries.map(([key, value]) =>
      prisma.siteSetting.upsert({
        where: { key },
        update: { value: String(value), updatedBy: admin?.username },
        create: { key, value: String(value), updatedBy: admin?.username },
      })
    )
  );

  await prisma.adminAuditLog.create({
    data: {
      adminUsername: admin?.username || 'unknown',
      action: `تعديل إعدادات الموقع (${entries.map(([k]) => k).join(', ')})`,
      ip: req.ip,
    },
  });

  // بدون ده، أي زائر تاني كان ممكن يستنى لحد 3 ثواني (عمر الكاش) قبل ما
  // يشوف إن الصيانة اتفعّلت أو اتلغت — إلغاء الكاش هنا بيخلي التغيير فوري.
  invalidateSiteSettingsCache();

  const rows = await prisma.siteSetting.findMany();
  const map: Record<string, string> = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  res.json({ settings: map });
});

export default router;
