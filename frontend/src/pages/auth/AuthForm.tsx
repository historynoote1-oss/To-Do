import { useState, useMemo } from 'react';
import { login, register } from '@/services/api';
import { sounds } from '@/services/audio/sounds';
import RehabilitationForm from '@/pages/auth/RehabilitationForm';
import ForgotPasswordForm from '@/pages/auth/ForgotPasswordForm';
import RecoveryCodeReveal from '@/pages/auth/RecoveryCodeReveal';
import { DynamicIcon } from '@/utils/icons';
import PasswordStrengthMeter from '@/pages/auth/PasswordStrengthMeter';
import { MIN_PASSWORD_LENGTH, passwordStrength } from '@/utils/passwordStrength';

export default function AuthForm({
  onSuccess,
  hideRegister,
}: {
  onSuccess: (username: string, isAdmin: boolean) => void;
  hideRegister?: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const usernameTooShort = mode === 'register' && username.length > 0 && username.trim().length < 3;
  const passwordTooShort = mode === 'register' && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch =
    mode === 'register' && confirmPassword.length > 0 && confirmPassword !== password;
  const canSubmit =
    mode === 'login'
      ? username.trim().length > 0 && password.length > 0
      : username.trim().length >= 3 && password.length >= MIN_PASSWORD_LENGTH && confirmPassword === password;

  // ===== حساب قديم محتاج إعادة تأهيل — بيظهر بدل النموذج العادي بعد login =====
  const [rehabToken, setRehabToken] = useState<string | null>(null);

  // ===== عرض كود الاسترجاع مرة واحدة بعد إنشاء حساب جديد بنجاح =====
  const [pendingSuccess, setPendingSuccess] = useState<{ username: string; isAdmin: boolean; token: string } | null>(
    null
  );
  const [revealCode, setRevealCode] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (username.trim().length < 3) {
        setError('اسم المستخدم لازم يكون 3 أحرف على الأقل');
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`كلمة المرور لازم تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`);
        return;
      }
      if (password !== confirmPassword) {
        setError('كلمة المرور وتأكيدها مش متطابقين');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        const registerResult = await register(username.trim(), password);
        sounds.success();
        setPendingSuccess({ username: registerResult.username, isAdmin: !!registerResult.isAdmin, token: registerResult.token });
        setRevealCode(registerResult.recoveryCode);
        return;
      }

      const loginResult = await login(username.trim(), password);

      if (loginResult.requiresRehabilitation) {
        sounds.click();
        setRehabToken(loginResult.rehabToken);
        return;
      }
      sounds.success();
      localStorage.setItem('token', loginResult.token);
      onSuccess(loginResult.username, !!loginResult.isAdmin);
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
        onContinue={() => {
          localStorage.setItem('token', pendingSuccess.token);
          onSuccess(pendingSuccess.username, pendingSuccess.isAdmin);
        }}
      />
    );
  }

  if (rehabToken) {
    return (
      <RehabilitationForm
        rehabToken={rehabToken}
        onSuccess={onSuccess}
        onCancel={() => setRehabToken(null)}
      />
    );
  }

  if (showForgotPassword) {
    return <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />;
  }

  return (
    <div className="auth-container">
      <h1>أهلاً بيك</h1>
      <p className="auth-container-subtitle">{mode === 'login' ? 'سجّل دخولك عشان تكمل شغلك' : 'اعمل حساب جديد وابدأ تنظيم مهامك'}</p>
      {!hideRegister && (
        <div className="auth-tabs">
          <span className={`auth-tabs-indicator ${mode === 'register' ? 'mode-register' : ''}`} />
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              sounds.click();
              setMode('login');
              setError(null);
              setConfirmPassword('');
            }}
            type="button"
          >
            تسجيل دخول
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              sounds.click();
              setMode('register');
              setError(null);
            }}
            type="button"
          >
            حساب جديد
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="field-group">
          <label htmlFor="auth-username" className="sr-only">
            اسم المستخدم
          </label>
          <input
            id="auth-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="اسم المستخدم"
            autoComplete="username"
            autoFocus
            aria-invalid={usernameTooShort}
            required
          />
          {usernameTooShort && <p className="field-hint">لازم 3 أحرف على الأقل</p>}
        </div>

        <div className="field-group">
          <label htmlFor="auth-password" className="sr-only">
            كلمة المرور
          </label>
          <div className="input-wrapper">
            <input
              id="auth-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
          {mode === 'register' && password.length > 0 && <PasswordStrengthMeter strength={strength} />}
        </div>

        {mode === 'register' && (
          <div className="field-group">
            <label htmlFor="auth-confirm-password" className="sr-only">
              تأكيد كلمة المرور
            </label>
            <input
              id="auth-confirm-password"
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
        )}

        {mode === 'register' && (
          <p className="field-hint">
            بعد إنشاء الحساب هنديك كود استرجاع — احفظه، هو الطريقة الوحيدة لاسترجاع حسابك لو نسيت كلمة المرور.
          </p>
        )}

        {error && <p className="error"><DynamicIcon name="alert" size={14} /> {error}</p>}

        <button type="submit" disabled={loading || !canSubmit}>
          {loading ? 'جاري التحميل...' : mode === 'login' ? 'دخول' : 'إنشاء حساب'}
        </button>

        {mode === 'login' && (
          <button
            type="button"
            className="auth-forgot-hint auth-forgot-link"
            onClick={() => {
              sounds.click();
              setShowForgotPassword(true);
            }}
          >
            نسيت كلمة المرور؟
          </button>
        )}
      </form>
    </div>
  );
}
