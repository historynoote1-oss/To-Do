import { Router } from 'express';
import { prisma } from '../lib/prisma';
import {
  hashPassword,
  comparePassword,
  signToken,
  signPendingTwoFactorToken,
  signPendingRehabToken,
  verifyPendingRehabToken,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  MIN_PASSWORD_LENGTH,
  generateSecureToken,
  hashToken,
  validatePasswordPolicy,
  checkPwnedPassword,
  RESET_TOKEN_TTL_MS,
  EMAIL_VERIFY_TTL_MS,
  RESEND_COOLDOWN_MS,
} from '../lib/auth';
import { getSiteSettings } from '../lib/siteSettings';
import { sendPasswordResetEmail, sendEmailVerificationEmail, sendRehabilitationCompletedEmail } from '../lib/email';
import { verifyUser, AuthRequest } from '../middleware/verifyUser';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// رسالة رد موحّدة لأي طلب "نسيت كلمة المرور" — سواء الحساب/الإيميل موجود أو
// مش موجود، عشان محدش يقدر "يعدّ" حسابات موجودة فعلًا (user enumeration)،
// زي ما بتوصي OWASP Forgot Password Cheat Sheet.
const GENERIC_RESET_MESSAGE = 'لو الحساب ده موجود عندنا، هيوصله إيميل فيه رابط إعادة تعيين كلمة المرور خلال دقايق.';

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body as { username?: string; email?: string; password?: string };

  const settings = await getSiteSettings();
  if (settings.maintenanceMode === 'true') {
    return res.status(503).json({ error: settings.maintenanceMessage || 'الموقع تحت الصيانة حاليًا', maintenance: true });
  }
  if (settings.registrationEnabled === 'false') {
    return res.status(403).json({ error: 'تسجيل حسابات جديدة متوقف مؤقتًا' });
  }

  if (!username?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'اسم المستخدم والإيميل وكلمة المرور مطلوبين' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'اسم المستخدم لازم يكون 3 أحرف على الأقل' });
  }
  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: 'صيغة الإيميل مش صحيحة' });
  }

  const policyErrors = validatePasswordPolicy(password, { username: username.trim(), email: normalizedEmail });
  if (policyErrors.length > 0) {
    return res.status(400).json({ error: policyErrors[0], passwordErrors: policyErrors });
  }
  if (await checkPwnedPassword(password)) {
    return res.status(400).json({
      error: 'كلمة المرور دي ظهرت قبل كده في تسريبات بيانات معروفة، اختار كلمة مرور تانية عشان أمان حسابك',
    });
  }

  const [existingUsername, existingEmail] = await Promise.all([
    prisma.user.findUnique({ where: { username: username.trim() } }),
    prisma.user.findUnique({ where: { email: normalizedEmail } }),
  ]);
  if (existingUsername) {
    return res.status(409).json({ error: 'اسم المستخدم ده مستخدم بالفعل' });
  }
  if (existingEmail) {
    return res.status(409).json({ error: 'في حساب مسجّل بالإيميل ده بالفعل' });
  }

  const passwordHash = await hashPassword(password);
  const verifyToken = generateSecureToken();
  const user = await prisma.user.create({
    data: {
      username: username.trim(),
      email: normalizedEmail,
      passwordHash,
      passwordUpdatedAt: new Date(),
      emailVerificationTokenHash: hashToken(verifyToken),
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      emailVerificationSentAt: new Date(),
    },
  });

  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (frontendUrl) {
    sendEmailVerificationEmail(normalizedEmail, `${frontendUrl}/?verifyToken=${verifyToken}`).catch(() => {});
  }

  const token = signToken(user.id, user.tokenVersion);
  res.json({ token, username: user.username, isAdmin: user.isAdmin, emailVerified: false });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبين' });
  }

  const user = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (!user) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غلط' });
  }
  if (!user.isActive) {
    return res.status(403).json({ error: 'الحساب ده متعلّق، تواصل مع إدارة الموقع' });
  }

  // وضع الصيانة بيمنع دخول أي حساب عادي، لكن بيسيب الباب مفتوح للأدمن
  // عشان يقدر يدخل يلغي الصيانة بنفسه من غير ما يحتاج وصول مباشر لقاعدة البيانات.
  if (!user.isAdmin) {
    const settings = await getSiteSettings();
    if (settings.maintenanceMode === 'true') {
      return res
        .status(503)
        .json({ error: settings.maintenanceMessage || 'الموقع تحت الصيانة حاليًا', maintenance: true });
    }
  }

  // الحساب مقفول مؤقتًا بسبب محاولات فاشلة كتيرة، حتى لو الباسورد المُدخل صح
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return res
      .status(423)
      .json({ error: `الحساب مقفول مؤقتًا بسبب محاولات دخول فاشلة، حاول تاني بعد ${minutesLeft} دقيقة` });
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockingNow = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockingNow ? 0 : attempts,
        lockedUntil: lockingNow ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
      },
    });
    if (lockingNow) {
      return res.status(423).json({
        error: `تم قفل الحساب مؤقتًا بعد ${MAX_FAILED_LOGIN_ATTEMPTS} محاولات فاشلة، حاول تاني بعد 15 دقيقة`,
      });
    }
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غلط' });
  }

  // الباسورد صح؛ لو الحساب لسه من النظام القديم (اتسجّل من غير إيميل) ومحتاج
  // "إعادة تأهيل"، منوقفش خالص عند تسجيل الدخول — بندّيله توكن مؤقت (10 دقايق)
  // يقدر يستخدمه في مسار /rehabilitate/complete بس، ومفيش وصول لأي حاجة تانية
  // في الموقع لحد ما يضيف إيميل وكلمة مرور جديدة قوية. بياناته القديمة (القوائم
  // والمهام) متربوطة بـ user.id نفسه فمش بتتلمس خالص في الخطوة دي.
  if (user.mustRehabilitate) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    const rehabToken = signPendingRehabToken(user.id);
    return res.json({ requiresRehabilitation: true, rehabToken, username: user.username });
  }

  // الباسورد صح؛ لو الحساب أدمن ومفعّل عليه 2FA، وقّف هنا ومتديش توكن دخول كامل
  // لحد ما يتأكد الكود من تطبيق المصادقة كمان — خطوة تانية منفصلة عن الباسورد.
  if (user.isAdmin && user.twoFactorEnabled) {
    const pendingToken = signPendingTwoFactorToken(user.id);
    return res.json({ requiresTwoFactor: true, pendingToken });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: req.ip,
      lastLoginUserAgent: req.headers['user-agent']?.slice(0, 200) || null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  const token = signToken(user.id, user.tokenVersion);
  res.json({ token, username: user.username, isAdmin: user.isAdmin, emailVerified: user.emailVerified });
});

// ============================================================================
// إعادة تأهيل الحسابات القديمة (Username+Password بسيط، من غير إيميل)
// ============================================================================
// الخطوة اللي بتكمّل بعد login رجّع requiresRehabilitation. بتاخد rehabToken
// (المؤقت، 10 دقايق) + إيميل جديد + كلمة مرور جديدة قوية، وبتحدّث نفس الحساب
// (نفس user.id) من غير ما تلمس أي قائمة أو مهمة قديمة خالص.
router.post('/rehabilitate/complete', async (req, res) => {
  const { rehabToken, email, password, confirmPassword } = req.body as {
    rehabToken?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  };

  if (!rehabToken || !email?.trim() || !password) {
    return res.status(400).json({ error: 'كل الحقول مطلوبة' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'كلمة المرور وتأكيدها مش متطابقين' });
  }

  let userId: string;
  try {
    userId = verifyPendingRehabToken(rehabToken).userId;
  } catch {
    return res.status(401).json({ error: 'انتهت صلاحية جلسة إعادة التأهيل، سجل دخول تاني بالباسورد القديم' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'الحساب مش موجود' });
  if (!user.mustRehabilitate) {
    // الحساب اتعالج بالفعل (مثلاً من تاب تاني)؛ منسمحش بتكرار العملية بتوكن قديم
    return res.status(400).json({ error: 'الحساب ده اتأهّل بالفعل، سجل دخول عادي' });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: 'صيغة الإيميل مش صحيحة' });
  }

  const policyErrors = validatePasswordPolicy(password, { username: user.username, email: normalizedEmail });
  if (policyErrors.length > 0) {
    return res.status(400).json({ error: policyErrors[0], passwordErrors: policyErrors });
  }
  if (await comparePassword(password, user.passwordHash)) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة لازم تكون مختلفة عن القديمة' });
  }
  if (await checkPwnedPassword(password)) {
    return res.status(400).json({
      error: 'كلمة المرور دي ظهرت قبل كده في تسريبات بيانات معروفة، اختار كلمة مرور تانية عشان أمان حسابك',
    });
  }

  const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingEmail && existingEmail.id !== user.id) {
    return res.status(409).json({ error: 'في حساب تاني بالفعل مسجّل بالإيميل ده' });
  }

  const passwordHash = await hashPassword(password);
  const verifyToken = generateSecureToken();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      email: normalizedEmail,
      passwordHash,
      passwordUpdatedAt: new Date(),
      mustRehabilitate: false,
      rehabilitatedAt: new Date(),
      tokenVersion: { increment: 1 }, // إلغاء أي توكنات قديمة (بما فيها rehabToken نفسه) فورًا
      failedLoginAttempts: 0,
      lockedUntil: null,
      emailVerificationTokenHash: hashToken(verifyToken),
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      emailVerificationSentAt: new Date(),
    },
  });

  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  sendRehabilitationCompletedEmail(normalizedEmail, updated.username).catch(() => {});
  if (frontendUrl) {
    sendEmailVerificationEmail(normalizedEmail, `${frontendUrl}/?verifyToken=${verifyToken}`).catch(() => {});
  }

  const token = signToken(updated.id, updated.tokenVersion);
  res.json({ token, username: updated.username, isAdmin: updated.isAdmin, emailVerified: false });
});

// ============================================================================
// نسيت كلمة المرور
// ============================================================================
router.post('/forgot-password', async (req, res) => {
  const { identifier } = req.body as { identifier?: string };
  if (!identifier?.trim()) {
    return res.status(400).json({ error: 'اكتب اسم المستخدم أو الإيميل بتاعك' });
  }

  const value = identifier.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: normalizeEmail(value) }, { username: value }] },
  });

  // رد موحّد دايمًا — بغض النظر لو الحساب موجود، نشط، أو معندوش إيميل أصلًا،
  // عشان نمنع اكتشاف الحسابات الموجودة (user enumeration).
  if (
    !user ||
    !user.isActive ||
    !user.email ||
    user.mustRehabilitate || // الحسابات القديمة لازم تعدي بمسار إعادة التأهيل، مش استرجاع الإيميل
    (user.resetTokenRequestedAt && Date.now() - user.resetTokenRequestedAt.getTime() < RESEND_COOLDOWN_MS)
  ) {
    return res.json({ message: GENERIC_RESET_MESSAGE });
  }

  const resetToken = generateSecureToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetTokenHash: hashToken(resetToken),
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      resetTokenRequestedAt: new Date(),
    },
  });

  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (frontendUrl) {
    sendPasswordResetEmail(user.email, `${frontendUrl}/?resetToken=${resetToken}`).catch(() => {});
  }

  res.json({ message: GENERIC_RESET_MESSAGE });
});

router.post('/reset-password', async (req, res) => {
  const { token, password, confirmPassword } = req.body as {
    token?: string;
    password?: string;
    confirmPassword?: string;
  };
  if (!token || !password) {
    return res.status(400).json({ error: 'التوكن وكلمة المرور الجديدة مطلوبين' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'كلمة المرور وتأكيدها مش متطابقين' });
  }

  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: new Date() } },
  });
  if (!user) {
    return res.status(400).json({ error: 'الرابط غير صالح أو منتهي، اطلب رابط جديد' });
  }

  const policyErrors = validatePasswordPolicy(password, { username: user.username, email: user.email || undefined });
  if (policyErrors.length > 0) {
    return res.status(400).json({ error: policyErrors[0], passwordErrors: policyErrors });
  }
  if (await comparePassword(password, user.passwordHash)) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة لازم تكون مختلفة عن القديمة' });
  }
  if (await checkPwnedPassword(password)) {
    return res.status(400).json({
      error: 'كلمة المرور دي ظهرت قبل كده في تسريبات بيانات معروفة، اختار كلمة مرور تانية عشان أمان حسابك',
    });
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordUpdatedAt: new Date(),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      tokenVersion: { increment: 1 }, // تسجيل خروج إجباري من كل الأجهزة القديمة
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  res.json({ message: 'تم تغيير كلمة المرور بنجاح، سجل دخول بكلمة المرور الجديدة' });
});

// ============================================================================
// تأكيد الإيميل
// ============================================================================
router.post('/verify-email', async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: 'التوكن مطلوب' });

  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { emailVerificationTokenHash: tokenHash, emailVerificationExpiresAt: { gt: new Date() } },
  });
  if (!user) {
    return res.status(400).json({ error: 'رابط التأكيد غير صالح أو منتهي' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerificationTokenHash: null, emailVerificationExpiresAt: null },
  });

  res.json({ message: 'تم تأكيد الإيميل بنجاح' });
});

// طلب إيميل تأكيد جديد — محتاج تسجيل دخول عادي (توكن سليم)، مع تهدئة دقيقة
// واحدة بين كل طلب وطلب عشان محدش يقدر يستخدمه لإغراق إيميل حد تاني بالسبام
// (مينفعش يطلبه أصلًا غير لحسابه هو نفسه، بس التهدئة حماية إضافية).
router.post('/resend-verification', verifyUser, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'الحساب مش موجود' });
  if (!user.email) return res.status(400).json({ error: 'لازم تضيف إيميل الأول' });
  if (user.emailVerified) return res.json({ message: 'الإيميل متأكد بالفعل' });
  if (user.emailVerificationSentAt && Date.now() - user.emailVerificationSentAt.getTime() < RESEND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'استنى شوية قبل ما تطلب إيميل تأكيد جديد' });
  }

  const verifyToken = generateSecureToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationTokenHash: hashToken(verifyToken),
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      emailVerificationSentAt: new Date(),
    },
  });

  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (frontendUrl) {
    await sendEmailVerificationEmail(user.email, `${frontendUrl}/?verifyToken=${verifyToken}`);
  }
  res.json({ message: 'اتبعت إيميل تأكيد جديد' });
});

export default router;
