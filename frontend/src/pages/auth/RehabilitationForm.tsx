import { useState, useMemo } from 'react';
import { completeRehabilitation } from '@/services/api';
import { sounds } from '@/services/audio/sounds';
import RecoveryCodeReveal from '@/pages/auth/RecoveryCodeReveal';
import { DynamicIcon } from '@/utils/icons';
import PasswordStrengthMeter from '@/pages/auth/PasswordStrengthMeter';
import { MIN_PASSWORD_LENGTH, passwordStrength } from '@/utils/passwordStrength';

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
      const rehabResult = await completeRehabilitation(rehabToken, password, confirmPassword);
      sounds.success();
      setPendingSuccess({ username: rehabResult.username, isAdmin: !!rehabResult.isAdmin, token: rehabResult.token });
      setRevealCode(rehabResult.recoveryCode);
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
        title="تم تأمين حسابك — احفظ كود الاسترجاع"
        onContinue={() => {
          localStorage.setItem('token', pendingSuccess.token);
          onSuccess(pendingSuccess.username, pendingSuccess.isAdmin);
        }}
      />
    );
  }

  return (
    <div className="auth-container">
      <h1><DynamicIcon name="lock" size={20} /> تأمين الحساب مطلوب</h1>
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
              <DynamicIcon name={showPassword ? 'eye-off' : 'eye'} size={16} />
            </button>
          </div>
          {password.length > 0 && <PasswordStrengthMeter strength={strength} />}
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

        {error && <p className="error"><DynamicIcon name="alert" size={14} /> {error}</p>}

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
