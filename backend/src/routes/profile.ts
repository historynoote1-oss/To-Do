import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import {
  hashPassword,
  comparePassword,
  signToken,
  validatePasswordPolicy,
  checkPwnedPassword,
  generateRecoveryCode,
  hashRecoveryCode,
} from '../lib/auth';

const router = Router();

// نفس لوحة الألوان المسموحة في التصميم الجديد (Ink & Pine) — بنتحقق من القيمة
// في السيرفر برضو عشان محدش يقدر يبعت أي لون عشوائي مباشرة للـ API.
const AVATAR_COLORS = [
  '#1d6f73', // pine (أساسي)
  '#0f4649', // pine غامق
  '#2e8b57', // نجاح
  '#c1443a', // خطر
  '#6b5fd1', // معلومة
  '#b5652f', // طيني
  '#3d6fbf', // أزرق
  '#8a6a10', // كهرماني غامق
];

const AVATAR_EMOJIS = ['😀', '🚀', '🔥', '🌟', '🎯', '📚', '💡', '🎨', '🧠', '🌙', '🌱', '⚡'];

const MAX_DISPLAY_NAME = 40;
const MAX_BIO = 160;

function serializeProfile(user: {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarColor: string | null;
  avatarEmoji: string | null;
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
    avatarColor: user.avatarColor || AVATAR_COLORS[0],
    avatarEmoji: user.avatarEmoji,
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
      avatarColor: true,
      avatarEmoji: true,
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
    avatarOptions: { colors: AVATAR_COLORS, emojis: AVATAR_EMOJIS },
  });
});

// تحديث بيانات العرض بس (اسم عرض، نبذة، أفتار) — مفيش أي حقل حساس هنا
// (مش username ولا باسورد)، فمش محتاجين تأكيد كلمة مرور للعملية دي.
router.patch('/', async (req: AuthRequest, res) => {
  const { displayName, bio, avatarColor, avatarEmoji } = req.body as {
    displayName?: string | null;
    bio?: string | null;
    avatarColor?: string | null;
    avatarEmoji?: string | null;
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

  if (avatarColor !== undefined) {
    if (avatarColor && !AVATAR_COLORS.includes(avatarColor)) {
      return res.status(400).json({ error: 'لون غير متاح' });
    }
    data.avatarColor = avatarColor || AVATAR_COLORS[0];
  }

  if (avatarEmoji !== undefined) {
    if (avatarEmoji && !AVATAR_EMOJIS.includes(avatarEmoji)) {
      return res.status(400).json({ error: 'إيموجي غير متاح' });
    }
    data.avatarEmoji = avatarEmoji || null;
  }

  const updated = await prisma.user.update({
    where: { id: req.userId! },
    select: {
      username: true,
      displayName: true,
      bio: true,
      avatarColor: true,
      avatarEmoji: true,
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
