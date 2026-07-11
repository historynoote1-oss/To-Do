import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// tokenVersion بيتحط جوه التوكن نفسه؛ لو الأدمن عمل force-logout أو reset password
// لأي حساب، بنزود tokenVersion بتاعه في القاعدة، فأي توكن قديم بيبقى باطل فورًا
// حتى لو لسه معاه 30 يوم صلاحية، لأن الأرقام مش هتتطابق.
export function signToken(userId: string, tokenVersion: number) {
  return jwt.sign({ userId, tokenVersion }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: string; tokenVersion: number } {
  return jwt.verify(token, JWT_SECRET) as { userId: string; tokenVersion: number };
}

// توكن قصير العمر (5 دقايق بس) بيتولّد بعد ما الباسورد يتأكد صح لحساب مفعّل عليه 2FA،
// وقبل ما نديله توكن الدخول الكامل. النوع 'pending2fa' بيمنع استخدام التوكن ده في أي
// endpoint تاني غير التحقق من كود الـ 2FA نفسه، حتى لو حد قدر يسرقه من الشبكة.
export function signPendingTwoFactorToken(userId: string) {
  return jwt.sign({ userId, type: 'pending2fa' }, JWT_SECRET, { expiresIn: '5m' });
}

export function verifyPendingTwoFactorToken(token: string): { userId: string } {
  const payload = jwt.verify(token, JWT_SECRET) as { userId: string; type?: string };
  if (payload.type !== 'pending2fa') {
    throw new Error('توكن غير صالح');
  }
  return { userId: payload.userId };
}

// توكن قصير العمر (10 دقايق) بيتولّد لحساب قديم (mustRehabilitate) بعد ما يتأكد
// إن الباسورد القديم بتاعه صح، وقبل ما ندّيه أي وصول للموقع — نفس فكرة توكن
// الـ 2FA المؤقت بالظبط: النوع 'pendingRehab' بيمنع استخدامه في أي مسار تاني
// غير إكمال إعادة التأهيل نفسها.
export function signPendingRehabToken(userId: string) {
  return jwt.sign({ userId, type: 'pendingRehab' }, JWT_SECRET, { expiresIn: '10m' });
}

export function verifyPendingRehabToken(token: string): { userId: string } {
  const payload = jwt.verify(token, JWT_SECRET) as { userId: string; type?: string };
  if (payload.type !== 'pendingRehab') {
    throw new Error('توكن غير صالح');
  }
  return { userId: payload.userId };
}

// إعدادات الحماية من محاولات تخمين كلمة المرور على مستوى الحساب نفسه
// (بالإضافة إلى الحماية على مستوى الـ IP الموجودة في index.ts)
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 دقيقة

// بيولّد باسورد مؤقت عشوائي قوي لاستخدامه في إعادة التعيين الإجبارية
export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}

// ============================================================================
// توكنات آمنة لمرة واحدة (استرجاع كلمة المرور / تأكيد الإيميل / إعادة التأهيل)
// ============================================================================
// بنولّد توكن عشوائي عالي الإنتروبيا (32 بايت) ونبعت النسخة الخام في الرابط/الرد،
// لكن اللي بيتخزن في القاعدة هو الـ hash بتاعه بس (SHA-256 كفاية هنا لأن التوكن
// نفسه عشوائي طويل مش باسورد بيختاره إنسان، فمفيش داعي لهاش بطيء زي bcrypt).
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ============================================================================
// كود الاسترجاع — بديل مجاني وفوري لاسترجاع كلمة المرور بالإيميل، مناسب
// لمواقع صغيرة من غير دومين أو خدمة إرسال إيميلات. الكود بيتولّد من أبجدية
// مختصرة (بدون أحرف/أرقام متشابهة بصريًا زي 0/O أو 1/I/L) عشان يبقى سهل
// القراءة والكتابة يدويًا لو المستخدم احتاج يستخدمه من جهاز تاني.
// 16 حرف من أبجدية 32 رمز ≈ 80 بت إنتروبيا — قوي جدًا زي الباسورد بالظبط.
// ============================================================================
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_GROUPS = 4;
const RECOVERY_CODE_GROUP_LENGTH = 4;

export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_CODE_GROUPS; g++) {
    let group = '';
    for (let i = 0; i < RECOVERY_CODE_GROUP_LENGTH; i++) {
      group += RECOVERY_CODE_ALPHABET[crypto.randomInt(RECOVERY_CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

// بنطبّع الكود (إزالة مسافات/شرطات وتوحيد حالة الأحرف) قبل الهاش والمقارنة،
// عشان لو المستخدم كتبه بحروف صغيرة أو من غير شرطات يفضل شغال برضو.
export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

// ============================================================================
// سياسة كلمة المرور — مبنية على OWASP ASVS 4.0.3 (V2.1) و NIST SP 800-63B:
// طول أدنى بدل قواعد تعقيد تعسفية (حروف كبيرة/صغيرة/رموز)، وطول أقصى معقول
// عشان نمنع هجمات DoS من باسوردات ضخمة جدًا قبل الهاش.
// ============================================================================
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

// قائمة مختصرة من أشهر الباسوردات المُسرّبة/المتوقعة، كخط دفاع أول سريع
// من غير أي استدعاء شبكة. بيتضاف عليها فحص أونلاين اختياري (checkPwnedPassword).
const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyuiop', 'qwerty123', 'letmein123', 'admin1234', 'welcome123', 'iloveyou1',
  '11111111', '00000000', 'abcd1234', 'a1b2c3d4', 'football1', 'monkey123',
]);

export function validatePasswordPolicy(password: string, context?: { username?: string }): string[] {
  const errors: string[] = [];
  if (!password) {
    errors.push('كلمة المرور مطلوبة');
    return errors;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`كلمة المرور لازم تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`كلمة المرور طويلة جدًا (الحد الأقصى ${MAX_PASSWORD_LENGTH} حرف)`);
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    errors.push('كلمة المرور دي شائعة جدًا وسهل تخمينها، اختار كلمة مرور مختلفة');
  }
  const lower = password.toLowerCase();
  if (context?.username && context.username.length >= 3 && lower.includes(context.username.toLowerCase())) {
    errors.push('كلمة المرور متقدرش تحتوي على اسم المستخدم بتاعك');
  }
  return errors;
}

// فحص اختياري (best-effort) لكلمة المرور مقابل قاعدة بيانات Have I Been Pwned
// باستخدام k-Anonymity: بنبعت أول 5 أحرف بس من هاش SHA-1 بتاع الباسورد، مش
// الباسورد نفسه ولا الهاش الكامل، فالخدمة مستحيل تعرف الباسورد الأصلي.
// لو الشبكة فشلت أو الخدمة مش متاحة، بنكمّل عادي من غير ما نمنع المستخدم —
// الفحص ده طبقة إضافية مش الأساس (الأساس هو الطول + منع الباسوردات الشائعة محليًا).
export async function checkPwnedPassword(password: string): Promise<boolean> {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.split('\n').some((line) => line.split(':')[0].trim() === suffix);
  } catch {
    return false; // فشل الشبكة مش سبب لمنع المستخدم من تغيير كلمة المرور
  }
}
