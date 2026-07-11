import { generateSecret as otpGenerateSecret, generateURI, verify as otpVerify } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';

// اسم التطبيق اللي هيظهر جوه تطبيق المصادقة (Google Authenticator / Authy / إلخ)
// بجانب اسم المستخدم، عشان الأدمن يقدر يميّز الحساب ده من حسابات تانية.
const ISSUER = 'Todo Admin';

export async function generateSecret(): Promise<string> {
  return otpGenerateSecret();
}

// نافذة تسامح بسيطة (خطوة واحدة قبل/بعد، أي ±30 ثانية) عشان اختلافات بسيطة
// في ساعة الجهاز ما تمنعش تسجيل الدخول، من غير ما نوسّع النافذة كتير وتقل الحماية.
export async function verifyTotpToken(token: string, secret: string): Promise<boolean> {
  try {
    const result = await otpVerify({ token: token.trim(), secret, window: 1 });
    return !!result?.valid;
  } catch {
    return false;
  }
}

export async function generateQrCodeDataUrl(username: string, secret: string): Promise<string> {
  const otpauth = await generateURI({ issuer: ISSUER, label: username, secret });
  return QRCode.toDataURL(otpauth);
}

// 10 أكواد استرجاع، كل واحد شكله XXXXX-XXXXX (سهل يتكتب يدوي لو الأدمن فقد
// جهاز المصادقة بتاعه). كل كود single-use وبيتخزن مشفّر زي الباسورد.
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 حروف/أرقام
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}
