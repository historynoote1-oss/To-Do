import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { requireAdminPassword } from '../middleware/requireAdminPassword';

const router = Router();

async function logAction(adminId: string, action: string, ip: string, targetTitle?: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { username: true } });
  await prisma.adminAuditLog.create({
    data: {
      adminUsername: admin?.username || 'unknown',
      targetUsername: targetTitle ? `تحديث: ${targetTitle}` : null,
      action,
      ip,
    },
  });
}

function cleanList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((s) => String(s).trim()).filter(Boolean);
}

function parseBody(body: any) {
  const data: any = {};
  if (typeof body.version === 'string') data.version = body.version.trim() || null;
  if (typeof body.emoji === 'string' && body.emoji.trim()) data.emoji = body.emoji.trim();
  if (typeof body.title === 'string') data.title = body.title.trim();
  if (Array.isArray(body.features)) data.features = cleanList(body.features);
  if (typeof body.howToTitle === 'string') data.howToTitle = body.howToTitle.trim() || null;
  if (Array.isArray(body.howToSteps)) data.howToSteps = cleanList(body.howToSteps);
  if (typeof body.authorName === 'string' && body.authorName.trim()) data.authorName = body.authorName.trim();
  if (typeof body.pinned === 'boolean') data.pinned = body.pinned;
  if (typeof body.isPublished === 'boolean') data.isPublished = body.isPublished;
  if (typeof body.publishedAt === 'string' && body.publishedAt) data.publishedAt = new Date(body.publishedAt);
  return data;
}

// لوحة إدارة التحديثات: بتجيب المسودات والمنشور مع بحث + تصفح سريع بالـ cursor
// (نفس أسلوب endpoint الجمهور)، عشان الأدمن يقدر يوصل لأي تحديث قديم أو جديد فورًا.
router.get('/', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = req.query.status; // 'all' | 'published' | 'draft' | 'pinned'
  const cursorId = typeof req.query.cursorId === 'string' ? req.query.cursorId : null;
  const cursorDate = typeof req.query.cursorDate === 'string' ? req.query.cursorDate : null;

  const statusFilter =
    status === 'draft'
      ? { isPublished: false }
      : status === 'published'
        ? { isPublished: true }
        : status === 'pinned'
          ? { pinned: true }
          : {};

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

  const rows = await prisma.update.findMany({
    where: { ...statusFilter, ...searchFilter, ...cursorFilter },
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

router.get('/stats', async (_req, res) => {
  const [total, published, draft, pinned] = await Promise.all([
    prisma.update.count(),
    prisma.update.count({ where: { isPublished: true } }),
    prisma.update.count({ where: { isPublished: false } }),
    prisma.update.count({ where: { pinned: true } }),
  ]);
  res.json({ total, published, draft, pinned });
});

router.get('/:id', async (req, res) => {
  const update = await prisma.update.findUnique({ where: { id: req.params.id } });
  if (!update) return res.status(404).json({ error: 'التحديث غير موجود' });
  res.json(update);
});

router.post('/', async (req: AuthRequest, res) => {
  const data = parseBody(req.body);
  if (!data.title) return res.status(400).json({ error: 'عنوان التحديث مطلوب' });

  const update = await prisma.update.create({
    data: {
      title: data.title,
      version: data.version ?? null,
      emoji: data.emoji ?? '✨',
      features: data.features ?? [],
      howToTitle: data.howToTitle ?? null,
      howToSteps: data.howToSteps ?? [],
      authorName: data.authorName ?? 'فريق الموقع',
      pinned: data.pinned ?? false,
      isPublished: data.isPublished ?? true,
      publishedAt: data.publishedAt ?? new Date(),
    },
  });

  await logAction(req.userId!, 'إنشاء تحديث جديد', req.ip!, update.title);
  res.status(201).json(update);
});

// تعديل أي حقل في أي تحديث (قديم أو جديد) — من غير الحاجة لتأكيد كلمة مرور
// عشان التعديل والتحرير يكونوا سريعين وسهلين كل ما الأدمن يحتاج يصلّح حاجة.
router.patch('/:id', async (req: AuthRequest, res) => {
  const existing = await prisma.update.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'التحديث غير موجود' });

  const data = parseBody(req.body);
  const update = await prisma.update.update({ where: { id: req.params.id }, data });

  await logAction(req.userId!, 'تعديل تحديث', req.ip!, update.title);
  res.json(update);
});

router.patch('/:id/pin', async (req: AuthRequest, res) => {
  const existing = await prisma.update.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'التحديث غير موجود' });

  const update = await prisma.update.update({
    where: { id: req.params.id },
    data: { pinned: !existing.pinned },
  });

  await logAction(req.userId!, update.pinned ? 'تثبيت تحديث' : 'إلغاء تثبيت تحديث', req.ip!, update.title);
  res.json(update);
});

router.patch('/:id/publish', async (req: AuthRequest, res) => {
  const existing = await prisma.update.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'التحديث غير موجود' });

  const update = await prisma.update.update({
    where: { id: req.params.id },
    data: { isPublished: !existing.isPublished },
  });

  await logAction(
    req.userId!,
    update.isPublished ? 'نشر تحديث' : 'إخفاء تحديث كمسودة',
    req.ip!,
    update.title
  );
  res.json(update);
});

// حذف نهائي — أخطر إجراء في إدارة التحديثات، فمحتاج تأكيد بكلمة مرور الأدمن
// زي باقي الإجراءات الخطيرة في اللوحة.
router.delete('/:id', requireAdminPassword, async (req: AuthRequest, res) => {
  const existing = await prisma.update.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'التحديث غير موجود' });

  await prisma.update.delete({ where: { id: req.params.id } });
  await logAction(req.userId!, 'حذف تحديث نهائيًا', req.ip!, existing.title);
  res.json({ success: true });
});

export default router;
