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

// إعدادات الحماية من محاولات تخمين كلمة المرور على مستوى الحساب نفسه
// (بالإضافة إلى الحماية على مستوى الـ IP الموجودة في index.ts)
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 دقيقة

// بيولّد باسورد مؤقت عشوائي قوي لاستخدامه في إعادة التعيين الإجبارية
export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}
