import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/core/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import {
  lifeAreaIconUpload,
  CLOUDINARY_ENABLED,
  uploadLifeAreaIconToCloudinary,
  deleteLifeAreaIconFromCloudinary,
  deleteLifeAreaIconFile,
} from '../lib/uploads/lifeAreaUpload';

const router = Router();

const MAX_NAME_LEN = 40;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// الأيقونة بقت تخزّن *مفتاح أيقونة Lucide* (مثلاً "graduation-cap")، مش
// إيموجي — فالحد لازم يستوعب أطول مفتاح ممكن (مع هامش أمان)، مع سماح
// بالتوافق مع أي إيموجي قديم مخزّن قبل التحديث ده.
const MAX_ICON_LEN = 30;
// أقصى عمق مسموح به للهيكل الهرمي (مجال ← فرعي ← فرعي من الفرعي...) —
// حد معقول يمنع تعشيش لا نهائي في الواجهة من غير ما يقيّد الاستخدام
// الطبيعي (غالبًا مستويين أو تلاتة بيكفوا أي حد).
const MAX_DEPTH = 5;

// ===== حساب إحصائيات "خاصة بالمجال نفسه" (من غير مجالاته الفرعية) =====
function ownStats(area: any) {
  const totalLists = area.lists?.length ?? 0;
  const completedLists =
    area.lists?.filter((l: any) => l.items.length > 0 && l.items.every((i: any) => i.isDone)).length ?? 0;
  const totalItems = area.lists?.reduce((sum: number, l: any) => sum + l.items.length, 0) ?? 0;
  const doneItems =
    area.lists?.reduce((sum: number, l: any) => sum + l.items.filter((i: any) => i.isDone).length, 0) ?? 0;
  const completionRate = totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100);
  return { totalLists, completedLists, totalItems, doneItems, completionRate };
}

function serializeArea(area: any, stats: ReturnType<typeof ownStats>, aggregated: ReturnType<typeof ownStats>, childCount: number) {
  return {
    id: area.id,
    name: area.name,
    color: area.color,
    icon: area.icon,
    imageUrl: area.imageUrl,
    position: area.position,
    parentId: area.parentId ?? null,
    childCount,
    createdAt: area.createdAt,
    updatedAt: area.updatedAt,
    stats,
    // aggregatedStats = إحصائيات المجال + كل المجالات الفرعية تحته (على
    // أي عمق) — بتفيد لما تبص على مجال أب وعايز تعرف الصورة الكاملة
    // لكل الفرع من غير ما تفتح كل مجال فرعي لوحده.
    aggregatedStats: aggregated,
  };
}

function sumStats(a: ReturnType<typeof ownStats>, b: ReturnType<typeof ownStats>) {
  const totalLists = a.totalLists + b.totalLists;
  const completedLists = a.completedLists + b.completedLists;
  const totalItems = a.totalItems + b.totalItems;
  const doneItems = a.doneItems + b.doneItems;
  const completionRate = totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100);
  return { totalLists, completedLists, totalItems, doneItems, completionRate };
}

const EMPTY_STATS = { totalLists: 0, completedLists: 0, totalItems: 0, doneItems: 0, completionRate: 0 };

// ===== بتبني كل المجالات (مع إحصائياتها المجمّعة هرميًا) لمستخدم واحد =====
async function loadSerializedAreas(userId: string) {
  const areas = await prisma.lifeArea.findMany({
    where: { userId },
    include: {
      lists: { select: { items: { select: { isDone: true } } } },
    },
    orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
  });

  const childrenOf = new Map<string | null, any[]>();
  for (const area of areas) {
    const key = area.parentId ?? null;
    const arr = childrenOf.get(key) || [];
    arr.push(area);
    childrenOf.set(key, arr);
  }
  const childCountOf = new Map<string, number>();
  for (const [parentId, kids] of childrenOf) {
    if (parentId) childCountOf.set(parentId, kids.length);
  }

  // بتحسب الإحصائيات المجمّعة (نفس المجال + كل نسله) بـ memoization،
  // عشان مجال ليه فروع كتير ومتداخلة ما يتحسبش أكتر من مرة.
  const aggregatedCache = new Map<string, ReturnType<typeof ownStats>>();
  function aggregatedStatsFor(areaId: string): ReturnType<typeof ownStats> {
    const cached = aggregatedCache.get(areaId);
    if (cached) return cached;
    const area = areas.find((a) => a.id === areaId);
    let result = area ? ownStats(area) : EMPTY_STATS;
    const kids = childrenOf.get(areaId) || [];
    for (const kid of kids) {
      result = sumStats(result, aggregatedStatsFor(kid.id));
    }
    aggregatedCache.set(areaId, result);
    return result;
  }

  return areas.map((area) =>
    serializeArea(area, ownStats(area), aggregatedStatsFor(area.id), childCountOf.get(area.id) ?? 0)
  );
}

function validateName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('اسم المجال مطلوب');
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_NAME_LEN) {
    throw new Error(`اسم المجال لازم يكون أقل من ${MAX_NAME_LEN} حرف`);
  }
  return trimmed;
}

function validateColor(value: unknown): string {
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
    throw new Error('اللون لازم يكون كود hex صحيح (مثلاً #7c3aed)');
  }
  return value;
}

function validateIcon(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || [...value].length > MAX_ICON_LEN) {
    throw new Error('الأيقونة غير صحيحة');
  }
  return value;
}

// ===== بتتأكد إن parentId (لو موجود) بيخص نفس المستخدم، مش بيعمل حلقة
// دائرية (مجال أب لنفسه بشكل غير مباشر)، ومش هيتعدى أقصى عمق مسموح =====
async function validateParentId(
  userId: string,
  parentId: unknown,
  selfId: string | null
): Promise<{ parentId: string | null; depth: number }> {
  if (parentId === undefined || parentId === null || parentId === '') {
    return { parentId: null, depth: 0 };
  }
  if (typeof parentId !== 'string') {
    throw new Error('مجال الأب غير صحيح');
  }
  if (selfId && parentId === selfId) {
    throw new Error('المجال مينفعش يكون أب لنفسه');
  }

  const allAreas = await prisma.lifeArea.findMany({
    where: { userId },
    select: { id: true, parentId: true },
  });
  const byId = new Map(allAreas.map((a) => [a.id, a]));

  const parent = byId.get(parentId);
  if (!parent) {
    throw new Error('مجال الأب غير موجود ضمن مجالاتك');
  }

  // امنع الحلقات الدائرية: تتبّع سلسلة الآباء لأعلى من المجال المطلوب
  // اختياره كأب، لو وصلنا لـ selfId في السلسلة، ده معناه دورة دائرية.
  let depth = 1;
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (selfId && cursor === selfId) {
      throw new Error('مينفعش تخلي مجال فرعي أب لأصله');
    }
    if (seen.has(cursor)) break; // حماية إضافية من بيانات تالفة
    seen.add(cursor);
    const node = byId.get(cursor);
    cursor = node?.parentId ?? null;
    if (cursor) depth += 1;
  }

  if (depth >= MAX_DEPTH) {
    throw new Error(`أقصى عمق مسموح للمجالات الفرعية هو ${MAX_DEPTH} مستويات`);
  }

  return { parentId, depth };
}

// ===== بتتأكد إن الاسم فريد بين إخوته (نفس parentId) — بيعمل الشغل اللي
// قيد UNIQUE في قاعدة البيانات مش هيغطّيه لما parentId يبقى null =====
async function assertSiblingNameUnique(
  userId: string,
  parentId: string | null,
  name: string,
  excludeId?: string
) {
  const clash = await prisma.lifeArea.findFirst({
    where: {
      userId,
      parentId,
      name,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new Error('فيه مجال بنفس الاسم في نفس المستوى بالفعل');
  }
}

// ===== قائمة كل مجالات المستخدم مع إحصائياتها (خاصة بيها + مجمّعة هرميًا) =====
router.get('/', async (req: AuthRequest, res) => {
  const serialized = await loadSerializedAreas(req.userId!);
  res.json(serialized);
});

// ===== إنشاء مجال جديد (جذري أو فرعي تحت مجال موجود) — بدون أي حد أقصى
// لعددهم، وبدون حد أقصى لعدد المستويات غير MAX_DEPTH =====
router.post('/', async (req: AuthRequest, res) => {
  let name: string;
  let color: string;
  let icon: string | null;
  let parentId: string | null;
  try {
    name = validateName(req.body.name);
    color = req.body.color !== undefined ? validateColor(req.body.color) : '#7c3aed';
    icon = validateIcon(req.body.icon);
    ({ parentId } = await validateParentId(req.userId!, req.body.parentId, null));
    await assertSiblingNameUnique(req.userId!, parentId, name);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  const last = await prisma.lifeArea.findFirst({
    where: { userId: req.userId!, parentId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  try {
    const area = await prisma.lifeArea.create({
      data: {
        userId: req.userId!,
        name,
        color,
        icon,
        parentId,
        position: (last?.position ?? -1) + 1,
      },
    });
    res.json(serializeArea({ ...area, lists: [] }, EMPTY_STATS, EMPTY_STATS, 0));
  } catch (err) {
    res.status(400).json({ error: 'فيه مجال بنفس الاسم بالفعل' });
  }
});

// ===== إعادة ترتيب المجالات — بتشتغل *على مستوى واحد بس* (إخوة ليهم نفس
// parentId): بتستقبل نفس الأب (parentId) + قائمة IDs بالترتيب الجديد
// الكامل لإخوته، وتحدّث position لكل واحد فيهم. =====
router.post('/reorder', async (req: AuthRequest, res) => {
  const { orderedIds } = req.body;
  const rawParentId = req.body.parentId;
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'ترتيب غير صحيح' });
  }
  const parentId: string | null = rawParentId === undefined || rawParentId === null || rawParentId === '' ? null : rawParentId;

  const owned = await prisma.lifeArea.findMany({
    where: { userId: req.userId!, id: { in: orderedIds } },
    select: { id: true, parentId: true },
  });
  if (owned.length !== orderedIds.length) {
    return res.status(400).json({ error: 'فيه مجال غير موجود ضمن قائمتك' });
  }
  if (owned.some((a) => (a.parentId ?? null) !== parentId)) {
    return res.status(400).json({ error: 'الترتيب لازم يكون بين مجالات في نفس المستوى' });
  }

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) =>
      prisma.lifeArea.update({ where: { id }, data: { position: index } })
    )
  );
  res.json({ success: true });
});

// ===== تعديل اسم/لون/أيقونة/مجال أب لمجال حياة =====
router.patch('/:id', async (req: AuthRequest, res) => {
  const area = await prisma.lifeArea.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!area) return res.status(404).json({ error: 'مجال الحياة غير موجود' });

  let name: string | undefined;
  let color: string | undefined;
  let icon: string | null | undefined;
  let parentId: string | null | undefined;
  try {
    if (req.body.name !== undefined) name = validateName(req.body.name);
    if (req.body.color !== undefined) color = validateColor(req.body.color);
    if (req.body.icon !== undefined) icon = validateIcon(req.body.icon);
    if (req.body.parentId !== undefined) {
      ({ parentId } = await validateParentId(req.userId!, req.body.parentId, area.id));
    }
    const effectiveParentId = parentId !== undefined ? parentId : area.parentId;
    const effectiveName = name !== undefined ? name : area.name;
    await assertSiblingNameUnique(req.userId!, effectiveParentId, effectiveName, area.id);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  // لو المجال اتنقل لأب جديد (أو اتحوّل لجذري)، بيتحط في آخر ترتيب إخوته
  // الجداد بدل ما يفضل يحمل position قديم مالوش معنى في المستوى الجديد.
  let position: number | undefined;
  if (parentId !== undefined && parentId !== area.parentId) {
    const last = await prisma.lifeArea.findFirst({
      where: { userId: req.userId!, parentId, id: { not: area.id } },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    position = (last?.position ?? -1) + 1;
  }

  try {
    const updated = await prisma.lifeArea.update({
      where: { id: area.id },
      data: { name, color, icon, parentId, position },
      include: { lists: { select: { items: { select: { isDone: true } } } } },
    });
    const childCount = await prisma.lifeArea.count({ where: { parentId: updated.id } });
    res.json(serializeArea(updated, ownStats(updated), ownStats(updated), childCount));
  } catch (err) {
    res.status(400).json({ error: 'فيه مجال بنفس الاسم بالفعل' });
  }
});

// ===== رفع صورة أيقونة مخصصة (multipart/form-data، حقل اسمه "icon") =====
router.post('/:id/icon-image', (req: AuthRequest, res) => {
  lifeAreaIconUpload(req, res, async (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'حجم الصورة أكبر من الحد المسموح (2 ميجابايت)' });
      }
      const message = err instanceof Error ? err.message : 'تعذّر رفع الصورة';
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'لازم تختار صورة عشان ترفعها' });

    // نفس ملحوظة profile.ts: الكود ده بيتنفذ جوه callback بتاع multer، برّة
    // الـ promise chain اللي express-async-errors بيراقبها، فمحتاج try/catch
    // يدوي هنا عشان أي خطأ يرجع رد للعميل بدل ما الطلب يفضل معلّق.
    try {
      const area = await prisma.lifeArea.findFirst({ where: { id: req.params.id, userId: req.userId! } });
      if (!area) return res.status(404).json({ error: 'مجال الحياة غير موجود' });

      let imageUrl: string;
      try {
        imageUrl = CLOUDINARY_ENABLED
          ? await uploadLifeAreaIconToCloudinary(req.file.buffer, req.file.mimetype, area.id)
          : `/uploads/life-area-icons/${req.file.filename}`;
      } catch (uploadErr) {
        const message = uploadErr instanceof Error ? uploadErr.message : 'تعذّر رفع الصورة';
        return res.status(502).json({ error: message });
      }

      const previousImageUrl = area.imageUrl;
      const updated = await prisma.lifeArea.update({
        where: { id: area.id },
        data: { imageUrl },
        include: { lists: { select: { items: { select: { isDone: true } } } } },
      });

      if (previousImageUrl) deleteLifeAreaIconFile(previousImageUrl);

      const childCount = await prisma.lifeArea.count({ where: { parentId: updated.id } });
      res.json(serializeArea(updated, ownStats(updated), ownStats(updated), childCount));
    } catch (err) {
      console.error('فشل تحديث أيقونة المجال بعد الرفع:', err);
      res.status(500).json({ error: 'حصل خطأ غير متوقع أثناء حفظ الصورة، حاول تاني' });
    }
  });
});

// ===== حذف صورة الأيقونة المخصصة والرجوع للإيموجي (أو الأيقونة الافتراضية) =====
router.delete('/:id/icon-image', async (req: AuthRequest, res) => {
  const area = await prisma.lifeArea.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!area) return res.status(404).json({ error: 'مجال الحياة غير موجود' });

  const updated = await prisma.lifeArea.update({
    where: { id: area.id },
    data: { imageUrl: null },
    include: { lists: { select: { items: { select: { isDone: true } } } } },
  });

  if (CLOUDINARY_ENABLED) {
    await deleteLifeAreaIconFromCloudinary(area.id);
  } else if (area.imageUrl) {
    deleteLifeAreaIconFile(area.imageUrl);
  }

  const childCount = await prisma.lifeArea.count({ where: { parentId: updated.id } });
  res.json(serializeArea(updated, ownStats(updated), ownStats(updated), childCount));
});

// ===== حذف مجال — المهام المرتبطة بيه بترجع "بدون مجال"، ومجالاته
// الفرعية (لو موجودة) بترجع "مجالات جذرية" مستقلة، مش بتتحذف معاه =====
router.delete('/:id', async (req: AuthRequest, res) => {
  const area = await prisma.lifeArea.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!area) return res.status(404).json({ error: 'مجال الحياة غير موجود' });

  await prisma.lifeArea.delete({ where: { id: area.id } });

  if (CLOUDINARY_ENABLED) {
    await deleteLifeAreaIconFromCloudinary(area.id);
  } else if (area.imageUrl) {
    deleteLifeAreaIconFile(area.imageUrl);
  }

  res.json({ success: true });
});

export default router;
