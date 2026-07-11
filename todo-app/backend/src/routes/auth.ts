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
  validatePasswordPolicy,
  checkPwnedPassword,
  generateRecoveryCode,
  hashRecoveryCode,
} from '../lib/auth';
import { getSiteSettings } from '../lib/siteSettings';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  const settings = await getSiteSettings();
  if (settings.maintenanceMode === 'true') {
    return res.status(503).json({ error: settings.maintenanceMessage || 'الموقع تحت الصيانة حاليًا', maintenance: true });
  }
  if (settings.registrationEnabled === 'false') {
    return res.status(403).json({ error: 'تسجيل حسابات جديدة متوقف مؤقتًا' });
  }

  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبين' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'اسم المستخدم لازم يكون 3 أحرف على الأقل' });
  }

  const policyErrors = validatePasswordPolicy(password, { username: username.trim() });
  if (policyErrors.length > 0) {
    return res.status(400).json({ error: policyErrors[0], passwordErrors: policyErrors });
  }
  if (await checkPwnedPassword(password)) {
    return res.status(400).json({
      error: 'كلمة المرور دي ظهرت قبل كده في تسريبات بيانات معروفة، اختار كلمة مرور تانية عشان أمان حسابك',
    });
  }

  const existingUsername = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (existingUsername) {
    return res.status(409).json({ error: 'اسم المستخدم ده مستخدم بالفعل' });
  }

  const passwordHash = await hashPassword(password);
  const recoveryCode = generateRecoveryCode();
  const user = await prisma.user.create({
    data: {
      username: username.trim(),
      passwordHash,
      passwordUpdatedAt: new Date(),
      recoveryCodeHash: hashRecoveryCode(recoveryCode),
      recoveryCodeCreatedAt: new Date(),
    },
  });

  const token = signToken(user.id, user.tokenVersion);
  res.json({ token, username: user.username, isAdmin: user.isAdmin, recoveryCode });
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

  // الباسورد صح؛ هنا الاكتشاف التلقائي للحسابات القديمة: أي حساب لسه مالوش
  // recoveryCodeHash خالص (يعني اتسجّل قبل ما نظام الاسترجاع ده يتضاف) بيتعامل
  // معاه كحساب "محتاج إعادة تأهيل" فورًا من غير ما يحتاج أي سكريبت يدوي يتشغّل
  // على السيرفر الأول — الاكتشاف بيحصل لوحده أول ما صاحب الحساب يجرب يدخل.
  if (!user.mustRehabilitate && !user.recoveryCodeHash && !user.rehabilitatedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { legacyAccount: true, mustRehabilitate: true },
    });
    user.mustRehabilitate = true;
  }

  // الباسورد صح؛ لو الحساب لسه من النظام القديم ومحتاج "إعادة تأهيل"، منوقفش
  // خالص عند تسجيل الدخول — بندّيله توكن مؤقت (10 دقايق) يقدر يستخدمه في مسار
  // /rehabilitate/complete بس، ومفيش وصول لأي حاجة تانية في الموقع لحد ما يختار
  // كلمة مرور جديدة قوية. بياناته القديمة (القوائم والمهام) متربوطة بـ user.id
  // نفسه فمش بتتلمس خالص في الخطوة دي.
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
  res.json({ token, username: user.username, isAdmin: user.isAdmin });
});

// ============================================================================
// إعادة تأهيل الحسابات القديمة (Username+Password بسيط، من غير كود استرجاع)
// ============================================================================
// الخطوة اللي بتكمّل بعد login رجّع requiresRehabilitation. بتاخد rehabToken
// (المؤقت، 10 دقايق) + كلمة مرور جديدة قوية، وبتحدّث نفس الحساب (نفس user.id)
// من غير ما تلمس أي قائمة أو مهمة قديمة خالص، وبتديله كود استرجاع جديد.
router.post('/rehabilitate/complete', async (req, res) => {
  const { rehabToken, password, confirmPassword } = req.body as {
    rehabToken?: string;
    password?: string;
    confirmPassword?: string;
  };

  if (!rehabToken || !password) {
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

  const policyErrors = validatePasswordPolicy(password, { username: user.username });
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
  const recoveryCode = generateRecoveryCode();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordUpdatedAt: new Date(),
      mustRehabilitate: false,
      rehabilitatedAt: new Date(),
      recoveryCodeHash: hashRecoveryCode(recoveryCode),
      recoveryCodeCreatedAt: new Date(),
      tokenVersion: { increment: 1 }, // إلغاء أي توكنات قديمة (بما فيها rehabToken نفسه) فورًا
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  const token = signToken(updated.id, updated.tokenVersion);
  res.json({ token, username: updated.username, isAdmin: updated.isAdmin, recoveryCode });
});

// ============================================================================
// نسيت كلمة المرور — عن طريق كود الاسترجاع بدل الإيميل
// ============================================================================
// رد موحّد قدر الإمكان لأي محاولة فاشلة (اسم مستخدم غلط أو كود غلط)، عشان
// نقلل من قدرة أي حد يكتشف أسماء مستخدمين موجودة فعلًا بالتجربة والخطأ.
const RECOVERY_ERROR = 'اسم المستخدم أو كود الاسترجاع غلط';

router.post('/reset-with-recovery-code', async (req, res) => {
  const { username, recoveryCode, password, confirmPassword } = req.body as {
    username?: string;
    recoveryCode?: string;
    password?: string;
    confirmPassword?: string;
  };

  if (!username?.trim() || !recoveryCode?.trim() || !password) {
    return res.status(400).json({ error: 'كل الحقول مطلوبة' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'كلمة المرور وتأكيدها مش متطابقين' });
  }

  const user = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (!user || !user.isActive || !user.recoveryCodeHash || user.mustRehabilitate) {
    return res.status(400).json({ error: RECOVERY_ERROR });
  }

  if (hashRecoveryCode(recoveryCode) !== user.recoveryCodeHash) {
    return res.status(400).json({ error: RECOVERY_ERROR });
  }

  const policyErrors = validatePasswordPolicy(password, { username: user.username });
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
  // بعد كل استخدام للكود، بنولّد كود جديد يحل محله فورًا (single-use)، عشان
  // لو حد قدر يشوف الكود القديم من مكان ما، يبقى بقى غير صالح خالص.
  const newRecoveryCode = generateRecoveryCode();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordUpdatedAt: new Date(),
      recoveryCodeHash: hashRecoveryCode(newRecoveryCode),
      recoveryCodeCreatedAt: new Date(),
      tokenVersion: { increment: 1 }, // تسجيل خروج إجباري من كل الأجهزة القديمة
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  res.json({ message: 'تم تغيير كلمة المرور بنجاح', recoveryCode: newRecoveryCode });
});

export default router;
