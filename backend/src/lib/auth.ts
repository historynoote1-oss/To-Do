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

// بيولّد باسورد مؤقت عشوائي قوي لاستخدامه في إعادة التعيين الإجبارية
export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}
