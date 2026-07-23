import { Router } from 'express';
import { prisma } from '../lib/core/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import multer from 'multer';
import {
  avatarUpload,
  deleteAvatarFile,
  CLOUDINARY_ENABLED,
  uploadAvatarToCloudinary,
  deleteAvatarFromCloudinary,
} from '../lib/uploads/avatarUpload';
import {
  hashPassword,
  comparePassword,
  signToken,
  validatePasswordPolicy,
  checkPwnedPassword,
  generateRecoveryCode,
  hashRecoveryCode,
} from '../lib/auth/auth';

const router = Router();

const MAX_DISPLAY_NAME = 40;
const MAX_BIO = 160;

function serializeProfile(user: {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  twoFactorEnabled: boolean;
  legacyAccount: boolean;
}) {
  return {
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    twoFactorEnabled: user.twoFactorEnabled,
    legacyAccount: user.legacyAccount,
  };
}

// نظرة عامة على حسابي: بيانات الملف الشخصي + إحصائيات محسوبة من قوائمي
// ومهامي الفعلية (مش أرقام مخزّنة منفصلة، عشان تفضل دايمًا دقيقة ١٠٠٪).
router.get('/', async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: {
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      isAdmin: true,
      createdAt: true,
      lastLoginAt: true,
      twoFactorEnabled: true,
      legacyAccount: true,
    },
  });
  if (!user) return res.status(404).json({ error: 'الحساب مش موجود' });

  const [lists, priorityGroups] = await Promise.all([
    prisma.todoList.findMany({
      where: { userId: req.userId! },
      select: { id: true, items: { select: { isDone: true } } },
    }),
    prisma.todoItem.groupBy({
      by: ['priority'],
      where: { list: { userId: req.userId! } },
      _count: { _all: true },
    }),
  ]);

  const totalLists = lists.length;
  const completedLists = lists.filter((l) => l.items.length > 0 && l.items.every((i) => i.isDone)).length;
  const totalItems = lists.reduce((sum, l) => sum + l.items.length, 0);
  const doneItems = lists.reduce((sum, l) => sum + l.items.filter((i) => i.isDone).length, 0);
  const completionRate = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const priority: Record<string, number> = { NONE: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const g of priorityGroups) priority[g.priority] = g._count._all;

  res.json({
    profile: serializeProfile(user),
    stats: { totalLists, completedLists, totalItems, doneItems, completionRate, priority },
  });
});

// تحديث بيانات العرض بس (اسم عرض، نبذة، أفتار) — مفيش أي حقل حساس هنا
// (مش username ولا باسورد)، فمش محتاجين تأكيد كلمة مرور للعملية دي.
router.patch('/', async (req: AuthRequest, res) => {
  const { displayName, bio } = req.body as {
    displayName?: string | null;
    bio?: string | null;
  };

  const data: Record<string, unknown> = {};

  if (displayName !== undefined) {
    const trimmed = displayName?.trim() || null;
    if (trimmed && trimmed.length > MAX_DISPLAY_NAME) {
      return res.status(400).json({ error: `اسم العرض لازم يكون أقل من ${MAX_DISPLAY_NAME} حرف` });
    }
    data.displayName = trimmed;
  }

  if (bio !== undefined) {
    const trimmed = bio?.trim() || null;
    if (trimmed && trimmed.length > MAX_BIO) {
      return res.status(400).json({ error: `النبذة لازم تكون أقل من ${MAX_BIO} حرف` });
    }
    data.bio = trimmed;
  }

  const updated = await prisma.user.update({
    where: { id: req.userId! },
    select: {
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      isAdmin: true,
      createdAt: true,
      lastLoginAt: true,
      twoFactorEnabled: true,
      legacyAccount: true,
    },
    data,
  });

  res.json({ profile: serializeProfile(updated) });
});

// رفع صورة أفتار جديدة (multipart/form-data، حقل اسمه "avatar") — بتحذف
// الصورة القديمة من على القرص لو موجودة، وبترجع الملف الشخصي محدّث بمسار
// الصورة الجديدة (avatarUrl) عشان الواجهة تعرضها فورًا من غير reload.
router.post('/avatar', (req: AuthRequest, res) => {
  avatarUpload(req, res, async (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'حجم الصورة أكبر من الحد المسموح (3 ميجابايت)' });
      }
      const message = err instanceof Error ? err.message : 'تعذّر رفع الصورة';
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'لازم تختار صورة عشان ترفعها' });
    }

    const previous = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { avatarUrl: true },
    });

    let avatarUrl: string;
    try {
      avatarUrl = CLOUDINARY_ENABLED
        ? await uploadAvatarToCloudinary(req.file.buffer, req.file.mimetype, req.userId!)
        : `/uploads/avatars/${req.file.filename}`;
    } catch (uploadErr) {
      const message = uploadErr instanceof Error ? uploadErr.message : 'تعذّر رفع الصورة';
      return res.status(502).json({ error: message });
    }

    const updated = await prisma.user.update({
      where: { id: req.userId! },
      select: {
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        isAdmin: true,
        createdAt: true,
        lastLoginAt: true,
        twoFactorEnabled: true,
        legacyAccount: true,
      },
      data: { avatarUrl },
    });

    if (previous?.avatarUrl) deleteAvatarFile(previous.avatarUrl);

    res.json({ profile: serializeProfile(updated) });
  });
});

// حذف صورة الأفتار الحالية والرجوع لعرض الحرف الأول من الاسم بدلها.
router.delete('/avatar', async (req: AuthRequest, res) => {
  const previous = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { avatarUrl: true },
  });

  const updated = await prisma.user.update({
    where: { id: req.userId! },
    select: {
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      isAdmin: true,
      createdAt: true,
      lastLoginAt: true,
      twoFactorEnabled: true,
      legacyAccount: true,
    },
    data: { avatarUrl: null },
  });

  if (CLOUDINARY_ENABLED) {
    await deleteAvatarFromCloudinary(req.userId!);
  } else if (previous?.avatarUrl) {
    deleteAvatarFile(previous.avatarUrl);
  }

  res.json({ profile: serializeProfile(updated) });
});

// تغيير كلمة المرور وأنا مسجّل دخول بالفعل — محتاج كلمة المرور الحالية
// كتأكيد. بنزوّد tokenVersion عشان أي جلسة تانية (جهاز/متصفح تاني) تتلغي
// فورًا، لكن بنولّد توكن جديد فورًا للجلسة الحالية عشان المستخدم منوقعش برّه.
router.post('/change-password', async (req: AuthRequest, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
    confirmNewPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'كل الحقول مطلوبة' });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة وتأكيدها مش متطابقين' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'الحساب مش موجود' });

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'كلمة المرور الحالية غلط' });
  }

  const policyErrors = validatePasswordPolicy(newPassword, { username: user.username });
  if (policyErrors.length > 0) {
    return res.status(400).json({ error: policyErrors[0], passwordErrors: policyErrors });
  }
  if (await comparePassword(newPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة لازم تكون مختلفة عن القديمة' });
  }
  if (await checkPwnedPassword(newPassword)) {
    return res.status(400).json({
      error: 'كلمة المرور دي ظهرت قبل كده في تسريبات بيانات معروفة، اختار كلمة مرور تانية عشان أمان حسابك',
    });
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordUpdatedAt: new Date(), tokenVersion: { increment: 1 } },
  });

  const token = signToken(updated.id, updated.tokenVersion);
  res.json({ token, message: 'اتغيّرت كلمة المرور بنجاح، وتسجّل الخروج من أي جهاز تاني' });
});

// تولّد كود استرجاع جديد يحل محل القديم — محتاج كلمة المرور الحالية كتأكيد
// عشان مينفعش أي حد يقدر يوصل للجلسة يولّد كود ويقفل صاحب الحساب الحقيقي برّه.
router.post('/regenerate-recovery-code', async (req: AuthRequest, res) => {
  const { currentPassword } = req.body as { currentPassword?: string };
  if (!currentPassword) {
    return res.status(400).json({ error: 'كلمة المرور الحالية مطلوبة' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'الحساب مش موجود' });

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'كلمة المرور الحالية غلط' });
  }

  const recoveryCode = generateRecoveryCode();
  await prisma.user.update({
    where: { id: user.id },
    data: { recoveryCodeHash: hashRecoveryCode(recoveryCode), recoveryCodeCreatedAt: new Date() },
  });

  res.json({ recoveryCode });
});

export default router;
