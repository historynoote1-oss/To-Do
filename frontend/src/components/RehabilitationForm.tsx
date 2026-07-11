import { useState, useMemo } from 'react';
import { completeRehabilitation } from '../lib/api';
import { sounds } from '../lib/sounds';
import RecoveryCodeReveal from './RecoveryCodeReveal';

const MIN_PASSWORD_LENGTH = 10;

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
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

export default function RehabilitationForm({
  rehabToken,
  onSuccess,
  onCancel,
}: {
  rehabToken: string;
  onSuccess: (username: string, isAdmin: boolean) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [pendingSuccess, setPendingSuccess] = useState<{ username: string; isAdmin: boolean; token: string } | null>(
    null
  );
  const [revealCode, setRevealCode] = useState<string | null>(null);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== password;
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && confirmPassword === password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    setLoading(true);
    try {
      const data = await completeRehabilitation(rehabToken, password, confirmPassword);
      sounds.success();
      setPendingSuccess({ username: data.username, isAdmin: !!data.isAdmin, token: data.token });
      setRevealCode(data.recoveryCode);
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : 'حصل خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  if (revealCode && pendingSuccess) {
    return (
      <RecoveryCodeReveal
        code={revealCode}
        title="تم تأمين حسابك ✅ — احفظ كود الاسترجاع"
        onContinue={() => {
          localStorage.setItem('token', pendingSuccess.token);
          onSuccess(pendingSuccess.username, pendingSuccess.isAdmin);
        }}
      />
    );
  }

  return (
    <div className="auth-container">
      <h1>تأمين الحساب مطلوب 🔒</h1>
      <p className="modal-text modal-hint rehab-intro">
        حسابك اتسجّل زمان بنظام قديم (اسم مستخدم وكلمة مرور بسيطة). عشان نكمّل تأمين الموقع، لازم تختار كلمة مرور
        جديدة أقوى. <strong>كل قوائمك ومهامك القديمة هتفضل موجودة بالكامل زي ما هي</strong> — الخطوة دي بتغيّر كلمة
        المرور بس، وهنديك بعدها كود استرجاع جديد لحسابك.
      </p>
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="field-group">
          <label htmlFor="rehab-password" className="sr-only">
            كلمة المرور الجديدة
          </label>
          <div className="input-wrapper">
            <input
              id="rehab-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور الجديدة"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              aria-invalid={passwordTooShort}
              required
            />
            <button
              type="button"
              className="input-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              tabIndex={-1}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {password.length > 0 && (
            <div className={`password-strength strength-${strength.score}`}>
              <span className="password-strength-bar">
                <span />
                <span />
                <span />
              </span>
              <span className="password-strength-label">{strength.label}</span>
            </div>
          )}
          <p className="field-hint">{MIN_PASSWORD_LENGTH} أحرف على الأقل، ولازم تكون مختلفة عن كلمة مرورك القديمة</p>
        </div>

        <div className="field-group">
          <label htmlFor="rehab-confirm-password" className="sr-only">
            تأكيد كلمة المرور
          </label>
          <input
            id="rehab-confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="تأكيد كلمة المرور الجديدة"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            aria-invalid={passwordsMismatch}
            required
          />
          {passwordsMismatch && <p className="field-hint field-hint-error">كلمة المرور مش متطابقة</p>}
        </div>

        {error && <p className="error">⚠️ {error}</p>}

        <button type="submit" disabled={loading || !canSubmit}>
          {loading ? 'جاري الحفظ...' : 'تأمين الحساب والمتابعة'}
        </button>
        <button type="button" className="small" onClick={onCancel}>
          رجوع
        </button>
      </form>
    </div>
  );
}
