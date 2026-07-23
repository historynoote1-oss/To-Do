import { Router } from 'express';
import { prisma } from '../lib/core/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { trashYear, restoreYear, TRASH_RETENTION_DAYS } from '../lib/core/trash';

const router = Router();

// بترجع كل السنوات المحذوفة حاليًا في سلة المحذوفات بتاعة المستخدم، مجمّعة
// سنة سنة، مع تفاصيل بسيطة لعرضها كبطاقة (عدد الأهداف على كل مستوى، تاريخ
// الحذف، وكام يوم متبقّي قبل الحذف النهائي التلقائي). الفرز بالأحدث حذفًا الأول.
router.get('/', async (req: AuthRequest, res) => {
  const trashed = await prisma.todoList.findMany({
    where: { userId: req.userId!, trashedAt: { not: null } },
    select: { id: true, title: true, category: true, trashedAt: true, trashedYear: true },
    orderBy: { trashedAt: 'desc' },
  });

  const byYear = new Map<number, { year: number; trashedAt: Date; counts: Record<string, number>; total: number }>();
  for (const g of trashed) {
    const year = g.trashedYear ?? 0;
    if (!byYear.has(year)) {
      byYear.set(year, { year, trashedAt: g.trashedAt!, counts: { YEARLY: 0, MONTHLY: 0, WEEKLY: 0, DAILY: 0 }, total: 0 });
    }
    const entry = byYear.get(year)!;
    // trashedAt واحد لكل دفعة حذف، بس بنحتفظ بالأحدث لو حصل أكتر من حذف/سنة بالغلط.
    if (g.trashedAt! > entry.trashedAt) entry.trashedAt = g.trashedAt!;
    const cat = g.category || 'YEARLY';
    entry.counts[cat] = (entry.counts[cat] || 0) + 1;
    entry.total += 1;
  }

  const now = Date.now();
  const result = Array.from(byYear.values())
    .sort((a, b) => b.trashedAt.getTime() - a.trashedAt.getTime())
    .map((entry) => {
      const expiresAt = new Date(entry.trashedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now) / (24 * 60 * 60 * 1000)));
      return {
        year: entry.year,
        trashedAt: entry.trashedAt,
        expiresAt,
        daysLeft,
        totalGoals: entry.total,
        counts: entry.counts,
      };
    });

  res.json(result);
});

// حذف سنة كاملة (كل الأهداف على كل المستويات تحتها) لسلة المحذوفات المؤقتة.
router.post('/years/:year', async (req: AuthRequest, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year)) return res.status(400).json({ error: 'سنة غير صحيحة' });

  const count = await trashYear(req.userId!, year);
  if (count === 0) {
    return res.status(404).json({ error: 'مفيش أي أهداف في السنة دي أصلًا عشان تتحذف' });
  }
  res.json({ success: true, count });
});

// استرجاع سنة كاملة من سلة المحذوفات — بترجع كل حاجة بالظبط لحالتها الأصلية.
router.post('/years/:year/restore', async (req: AuthRequest, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year)) return res.status(400).json({ error: 'سنة غير صحيحة' });

  const count = await restoreYear(req.userId!, year);
  if (count === 0) {
    return res.status(404).json({ error: 'السنة دي مش موجودة في سلة المحذوفات' });
  }
  res.json({ success: true, count });
});

export default router;
