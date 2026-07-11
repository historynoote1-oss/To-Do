import { useMemo, useState } from 'react';
import { resetPassword } from '../lib/api';
import { sounds } from '../lib/sounds';

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

export default function ResetPasswordPage({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== password;
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && confirmPassword === password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, password, confirmPassword);
      sounds.success();
      setDone(true);
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : 'حصل خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="auth-container">
        <h1>تم بنجاح ✅</h1>
        <div className="auth-form">
          <p className="modal-text modal-hint">تم تغيير كلمة المرور بنجاح، سجل دخول بكلمة المرور الجديدة.</p>
          <button type="button" onClick={onDone}>
            الذهاب لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <h1>إعادة تعيين كلمة المرور</h1>
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="field-group">
          <label htmlFor="reset-password" className="sr-only">
            كلمة المرور الجديدة
          </label>
          <div className="input-wrapper">
            <input
              id="reset-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور الجديدة"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
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
          <p className="field-hint">{MIN_PASSWORD_LENGTH} أحرف على الأقل</p>
        </div>

        <div className="field-group">
          <label htmlFor="reset-confirm" className="sr-only">
            تأكيد كلمة المرور
          </label>
          <input
            id="reset-confirm"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="تأكيد كلمة المرور"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            aria-invalid={passwordsMismatch}
            required
          />
          {passwordsMismatch && <p className="field-hint field-hint-error">كلمة المرور مش متطابقة</p>}
        </div>

        {error && <p className="error">⚠️ {error}</p>}

        <button type="submit" disabled={loading || !canSubmit}>
          {loading ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
        </button>
        <button type="button" className="small" onClick={onDone}>
          إلغاء والرجوع لتسجيل الدخول
        </button>
      </form>
    </div>
  );
}
