import { useMemo, useState } from 'react';
import { resetWithRecoveryCode } from '../lib/api';
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

export default function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== password;
  const canSubmit =
    username.trim().length > 0 &&
    recoveryCode.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword === password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const data = await resetWithRecoveryCode(username.trim(), recoveryCode.trim(), password, confirmPassword);
      sounds.success();
      setNewRecoveryCode(data.recoveryCode);
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : 'حصل خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  if (newRecoveryCode) {
    return (
      <RecoveryCodeReveal
        code={newRecoveryCode}
        title="تم تغيير كلمة المرور ✅ — كود استرجاعك اتغيّر كمان"
        onContinue={onBack}
      />
    );
  }

  return (
    <div className="auth-container">
      <h1>نسيت كلمة المرور</h1>
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <p className="modal-text modal-hint">
          اكتب اسم المستخدم وكود الاسترجاع اللي اتديتلك وقت إنشاء الحساب، واختار كلمة مرور جديدة.
        </p>
        <div className="field-group">
          <label htmlFor="forgot-username" className="sr-only">
            اسم المستخدم
          </label>
          <input
            id="forgot-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="اسم المستخدم"
            autoComplete="username"
            autoFocus
            required
          />
        </div>
        <div className="field-group">
          <label htmlFor="forgot-recovery-code" className="sr-only">
            كود الاسترجاع
          </label>
          <input
            id="forgot-recovery-code"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            placeholder="كود الاسترجاع (XXXX-XXXX-XXXX-XXXX)"
            autoComplete="off"
            className="recovery-code-input"
            required
          />
        </div>
        <div className="field-group">
          <label htmlFor="forgot-password" className="sr-only">
            كلمة المرور الجديدة
          </label>
          <div className="input-wrapper">
            <input
              id="forgot-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور الجديدة"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
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
          <label htmlFor="forgot-confirm" className="sr-only">
            تأكيد كلمة المرور
          </label>
          <input
            id="forgot-confirm"
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
        <button type="button" className="small" onClick={onBack}>
          رجوع لتسجيل الدخول
        </button>
      </form>
    </div>
  );
}
