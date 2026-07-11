import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { requireAdminPassword } from '../middleware/requireAdminPassword';

const router = Router();

// القيم الافتراضية لكل إعداد — لو مفيش صف في قاعدة البيانات لسه، بيترجع الافتراضي ده
// عشان اللوحة تشتغل صح من أول تشغيل من غير أي إعداد يدوي مسبق.
const DEFAULTS: Record<string, string> = {
  siteName: 'قوائم المهام',
  registrationEnabled: 'true',
  maintenanceMode: 'false',
  maintenanceMessage: 'الموقع تحت الصيانة حاليًا، هنرجع قريب 🛠️',
  maxListsPerUser: '0', // 0 = بدون حد أقصى
  maxItemsPerList: '0',
  announcementBanner: '',
};

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

  const rows = await prisma.siteSetting.findMany();
  const map: Record<string, string> = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  res.json({ settings: map });
});

export default router;
