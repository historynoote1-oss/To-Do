import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { resolveActivityDay } from '../lib/localDate';

const router = Router();

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

// بيرجّع الاستريك الحالي (عدد الأيام المتتالية اللي المستخدم خلّص فيها مهمة
// رئيسية واحدة على الأقل، من النهاردة أو إمبارح رجوعًا للخلف). محسوب live
// من UserActivityDay مباشرة، فمفيش عداد مخزّن ممكن يتعارض مع البيانات
// الفعلية ومفيش داعي لأي جدولة يومية تصفّره — لو يوم اتفوّت، هو ببساطة
// مش موجود في السلسلة وبيوقف العد.
router.get('/', async (req: AuthRequest, res) => {
  const days = await prisma.userActivityDay.findMany({
    where: { userId: req.userId! },
    select: { date: true },
    orderBy: { date: 'desc' },
    take: 400, // كافي لتغطية أي استريك واقعي من غير ما نجيب الجدول كله
  });
  const activeDays = new Set(days.map((d) => dayKey(d.date)));

  // "النهاردة" بالنسبة للاستريك لازم تكون يوم المستخدم المحلي، مش يوم
  // السيرفر UTC — وإلا مستخدم بتوقيت متقدّم عن UTC (زي القاهرة) هيلاقي
  // استريكه بيتصفّر أو بيقفز غلط حوالين نص الليل بتوقيته هو. الفرونت بيبعت
  // تاريخه المحلي في ?date=YYYY-MM-DD مع كل طلب.
  const cursor = resolveActivityDay(req.query.date);

  // لو النهاردة لسه معملش فيه إنجاز، الاستريك ممكن يكون لسه "حي" (اليوم لسه
  // ما خلصش) — بنبدأ العد من إمبارح بدل ما نصفّره فورًا قبل نص الليل.
  if (!activeDays.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let current = 0;
  while (activeDays.has(dayKey(cursor))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  res.json({ current });
});

export default router;
