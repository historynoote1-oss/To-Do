// لازم يفضل متطابق مع MIN_PASSWORD_LENGTH في backend/src/services/auth.ts
export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3;
  label: string;
}

// نسخة واحدة موحّدة كانت متكررة (بفروق طفيفة) في AuthForm وForgotPasswordForm
// وRehabilitationForm. النسخة القديمة في AuthForm كانت بتستخدم عتبة 12 حرف
// للنقطة الإضافية بدل 14 المستخدمة في الملفين التانيين — فرق غير مقصود
// اتصلح هنا عشان الثلاث فورمز يديوا نفس التقييم بالظبط لنفس الباسورد.
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 14) score++;
  const varietyCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(password)).length;
  if (varietyCount >= 3) score++;

  if (password.length < MIN_PASSWORD_LENGTH) return { score: 0, label: 'قصيرة جدًا' };
  if (score <= 1) return { score: 1, label: 'ضعيفة' };
  if (score === 2) return { score: 2, label: 'متوسطة' };
  return { score: 3, label: 'قوية' };
}
