import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, verifyUser } from '../middleware/verifyUser';
import { comparePassword, hashPassword, signToken, verifyPendingTwoFactorToken } from '../lib/auth';
import {
  generateSecret,
  generateQrCodeDataUrl,
  verifyTotpToken,
  generateRecoveryCodes,
} from '../lib/twoFactor';

const router = Router();

async function logAction(adminId: string, action: string, ip: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { username: true } });
  await prisma.adminAuditLog.create({
    data: { adminUsername: admin?.username || 'unknown', action, ip },
  });
}

// حالة الـ 2FA للحساب الحالي (مفعّل ولا لأ) — بيستخدمها تبويب "الأمان" في اللوحة
router.get('/status', verifyUser, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { twoFactorEnabled: true, twoFactorEnabledAt: true },
  });
  res.json(user);
});

// خطوة 1 من الإعداد: بيولّد سر جديد (لسه مش مفعّل) وكود QR للمسح بتطبيق المصادقة
router.post('/setup', verifyUser, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (!user.isAdmin) {
    return res.status(403).json({ error: 'التحقق بخطوتين متاح لحسابات الأدمن بس حاليًا' });
  }
  if (user.twoFactorEnabled) {
    return res.status(400).json({ error: 'التحقق بخطوتين مفعّل بالفعل على حسابك' });
  }

  const secret = await generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { pendingTwoFactorSecret: secret } });

  const qrDataUrl = await generateQrCodeDataUrl(user.username, secret);
  res.json({ secret, qrDataUrl });
});

// خطوة 2 من الإعداد: الأدمن بيكتب الكود اللي ظهر في تطبيق المصادقة عشان نتأكد
// إنه فعلاً مسح الـ QR صح وإن الساعة متزامنة، وبعدين نفعّل الـ 2FA فعليًا
// ونولّد أكواد استرجاع بتتعرض مرة واحدة بس دلوقتي.
router.post('/enable', verifyUser, async (req: AuthRequest, res) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: 'اكتب الكود من تطبيق المصادقة' });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.pendingTwoFactorSecret) {
    return res.status(400).json({ error: 'لازم تبدأ خطوة الإعداد الأول' });
  }

  if (!(await verifyTotpToken(code, user.pendingTwoFactorSecret))) {
    return res.status(400).json({ error: 'الكود غلط، جرّب تاني' });
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashedCodes = await Promise.all(recoveryCodes.map((c) => hashPassword(c)));

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: user.pendingTwoFactorSecret,
      pendingTwoFactorSecret: null,
      twoFactorRecoveryCodes: hashedCodes,
      twoFactorEnabledAt: new Date(),
      tokenVersion: { increment: 1 }, // يقفل أي جلسة قديمة غير محمية بالـ 2FA
    },
  });

  await logAction(user.id, 'تفعيل التحقق بخطوتين', req.ip!);
  res.json({ success: true, recoveryCodes });
});

// إلغاء الـ 2FA — يحتاج الباسورد وكود صحيح من التطبيق سوا، عشان محدش يقدر
// يلغي الحماية بسرعة حتى لو قدر يسرق جلسة الأدمن لحظيًا.
router.post('/disable', verifyUser, async (req: AuthRequest, res) => {
  const { password, code } = req.body as { password?: string; code?: string };
  if (!password || !code) {
    return res.status(400).json({ error: 'لازم كلمة المرور والكود سوا عشان تلغي الحماية' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return res.status(400).json({ error: 'التحقق بخطوتين مش مفعّل أصلًا' });
  }

  const validPassword = await comparePassword(password, user.passwordHash);
  const validCode = await verifyTotpToken(code, user.twoFactorSecret);
  if (!validPassword || !validCode) {
    return res.status(403).json({ error: 'كلمة المرور أو الكود غلط' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      pendingTwoFactorSecret: null,
      twoFactorRecoveryCodes: [],
      twoFactorEnabledAt: null,
    },
  });

  await logAction(user.id, 'إلغاء التحقق بخطوتين', req.ip!);
  res.json({ success: true });
});

// خطوة التحقق أثناء تسجيل الدخول: بتاخد التوكن المؤقت (5 دقايق) اللي رجع من
// /api/auth/login مع الكود، ولو صح بتديله توكن الدخول الكامل. بتقبل كمان
// كود استرجاع بدل كود التطبيق (single-use) لو الأدمن فاقد جهازه.
router.post('/verify-login', async (req, res) => {
  const { pendingToken, code } = req.body as { pendingToken?: string; code?: string };
  if (!pendingToken || !code) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  let userId: string;
  try {
    userId = verifyPendingTwoFactorToken(pendingToken).userId;
  } catch {
    return res.status(401).json({ error: 'انتهت صلاحية محاولة الدخول، سجّل دخول من الأول' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return res.status(403).json({ error: 'تعذّر إتمام الدخول' });
  }

  let usedRecoveryCode: string | null = null;
  let valid = await verifyTotpToken(code, user.twoFactorSecret);

  if (!valid) {
    // جرّب أكواد الاسترجاع لو الكود مش TOTP صحيح
    for (const hashed of user.twoFactorRecoveryCodes) {
      if (await comparePassword(code.trim().toUpperCase(), hashed)) {
        valid = true;
        usedRecoveryCode = hashed;
        break;
      }
    }
  }

  if (!valid) {
    return res.status(401).json({ error: 'الكود غلط' });
  }

  const data: Record<string, unknown> = {
    lastLoginAt: new Date(),
    lastLoginIp: req.ip,
    lastLoginUserAgent: req.headers['user-agent']?.slice(0, 200) || null,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
  if (usedRecoveryCode) {
    // احذف كود الاسترجاع المستخدم عشان ميتستخدمش تاني (single-use)
    data.twoFactorRecoveryCodes = user.twoFactorRecoveryCodes.filter((c) => c !== usedRecoveryCode);
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data });

  if (usedRecoveryCode) {
    await logAction(user.id, 'دخول باستخدام كود استرجاع 2FA', req.ip!);
  }

  const token = signToken(updated.id, updated.tokenVersion);
  res.json({ token, username: updated.username, isAdmin: updated.isAdmin });
});

export default router;
