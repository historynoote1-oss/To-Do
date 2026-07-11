import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

const PUBLIC_SELECT = {
  id: true,
  version: true,
  emoji: true,
  title: true,
  features: true,
  howToTitle: true,
  howToSteps: true,
  authorName: true,
  pinned: true,
  publishedAt: true,
} as const;

// التحديثات المثبّتة (زي "مثبّت في الأعلى") — قليلة العدد دايمًا، فبتتجاب مرة واحدة
// وبتتعرض فوق باقي القايمة بغض النظر عن ترتيبها الزمني.
router.get('/pinned', async (_req, res) => {
  const pinned = await prisma.update.findMany({
    where: { isPublished: true, pinned: true },
    select: PUBLIC_SELECT,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: 20,
  });
  res.json(pinned);
});

// تصفح التحديثات بطريقة keyset pagination (مؤشر cursor) بدل OFFSET.
// ده اللي بيخلي الأداء ثابت وسريع سواء فيه 100 تحديث أو 900,000 تحديث،
// لأن قاعدة البيانات مش محتاجة "تعد" وتتخطى صفوف زي ما بيحصل مع OFFSET.
router.get('/', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const cursorId = typeof req.query.cursorId === 'string' ? req.query.cursorId : null;
  const cursorDate = typeof req.query.cursorDate === 'string' ? req.query.cursorDate : null;

  const searchFilter = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { version: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const cursorFilter =
    cursorId && cursorDate
      ? {
          OR: [
            { publishedAt: { lt: new Date(cursorDate) } },
            { publishedAt: new Date(cursorDate), id: { lt: cursorId } },
          ],
        }
      : {};

  // التحديثات المثبّتة ما بتظهرش تاني هنا عشان ميحصلش تكرار مع endpoint الخاص بيها
  const rows = await prisma.update.findMany({
    where: { isPublished: true, pinned: false, ...searchFilter, ...cursorFilter },
    select: PUBLIC_SELECT,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  res.json({
    items,
    nextCursor: hasMore && last ? { cursorId: last.id, cursorDate: last.publishedAt.toISOString() } : null,
  });
});

router.get('/:id', async (req, res) => {
  const update = await prisma.update.findFirst({
    where: { id: req.params.id, isPublished: true },
    select: PUBLIC_SELECT,
  });
  if (!update) return res.status(404).json({ error: 'التحديث غير موجود' });
  res.json(update);
});

export default router;
