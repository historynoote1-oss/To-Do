import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import {
  lifeAreaIconUpload,
  CLOUDINARY_ENABLED,
  uploadLifeAreaIconToCloudinary,
  deleteLifeAreaIconFromCloudinary,
  deleteLifeAreaIconFile,
} from '../lib/lifeAreaUpload';

const router = Router();

const MAX_NAME_LEN = 40;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// أيقونة نصية (إيموجي غالبًا) — بنحدد طول معقول عشان محدش يبعت نص طويل بدل إيموجي.
const MAX_ICON_LEN = 8;

function serializeArea(area: any) {
  const totalLists = area.lists?.length ?? 0;
  const completedLists =
    area.lists?.filter((l: any) => l.items.length > 0 && l.items.every((i: any) => i.isDone)).length ?? 0;
  const totalItems = area.lists?.reduce((sum: number, l: any) => sum + l.items.length, 0) ?? 0;
  const doneItems =
    area.lists?.reduce((sum: number, l: any) => sum + l.items.filter((i: any) => i.isDone).length, 0) ?? 0;
  const completionRate = totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100);

  return {
    id: area.id,
    name: area.name,
    color: area.color,
    icon: area.icon,
    imageUrl: area.imageUrl,
    position: area.position,
    createdAt: area.createdAt,
    updatedAt: area.updatedAt,
    stats: {
      totalLists,
      completedLists,
      totalItems,
      doneItems,
      completionRate,
    },
  };
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
    throw new Error('اللون لازم يكون كود hex صحيح (مثلاً #1d6f73)');
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

// ===== قائمة كل مجالات المستخدم مع إحصائياتها =====
router.get('/', async (req: AuthRequest, res) => {
  const areas = await prisma.lifeArea.findMany({
    where: { userId: req.userId! },
    include: {
      lists: { select: { items: { select: { isDone: true } } } },
    },
    orderBy: { position: 'asc' },
  });
  res.json(areas.map(serializeArea));
});

// ===== إنشاء مجال جديد — بدون أي حد أقصى لعددهم =====
router.post('/', async (req: AuthRequest, res) => {
  let name: string;
  let color: string;
  let icon: string | null;
  try {
    name = validateName(req.body.name);
    color = req.body.color !== undefined ? validateColor(req.body.color) : '#1d6f73';
    icon = validateIcon(req.body.icon);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  const last = await prisma.lifeArea.findFirst({
    where: { userId: req.userId! },
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
        position: (last?.position ?? -1) + 1,
      },
    });
    res.json(serializeArea({ ...area, lists: [] }));
  } catch (err) {
    res.status(400).json({ error: 'فيه مجال بنفس الاسم بالفعل' });
  }
});

// ===== إعادة ترتيب المجالات (سحب وإفلات / أسهم فوق-تحت في الواجهة) =====
// بتستقبل قائمة IDs بالترتيب الجديد الكامل وتحدّث position لكل واحد منها.
router.post('/reorder', async (req: AuthRequest, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'ترتيب غير صحيح' });
  }

  const owned = await prisma.lifeArea.findMany({
    where: { userId: req.userId!, id: { in: orderedIds } },
    select: { id: true },
  });
  if (owned.length !== orderedIds.length) {
    return res.status(400).json({ error: 'فيه مجال غير موجود ضمن قائمتك' });
  }

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) =>
      prisma.lifeArea.update({ where: { id }, data: { position: index } })
    )
  );
  res.json({ success: true });
});

// ===== تعديل اسم/لون/أيقونة مجال =====
router.patch('/:id', async (req: AuthRequest, res) => {
  const area = await prisma.lifeArea.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!area) return res.status(404).json({ error: 'مجال الحياة غير موجود' });

  let name: string | undefined;
  let color: string | undefined;
  let icon: string | null | undefined;
  try {
    if (req.body.name !== undefined) name = validateName(req.body.name);
    if (req.body.color !== undefined) color = validateColor(req.body.color);
    if (req.body.icon !== undefined) icon = validateIcon(req.body.icon);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  try {
    const updated = await prisma.lifeArea.update({
      where: { id: area.id },
      data: { name, color, icon },
      include: { lists: { select: { items: { select: { isDone: true } } } } },
    });
    res.json(serializeArea(updated));
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

    res.json(serializeArea(updated));
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

  res.json(serializeArea(updated));
});

// ===== حذف مجال — المهام المرتبطة بيه بترجع "بدون مجال" مش بتتحذف =====
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
