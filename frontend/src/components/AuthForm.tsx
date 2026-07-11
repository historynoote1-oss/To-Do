import { useState, useMemo } from 'react';
import { login, register, verifyLoginTwoFactor } from '../lib/api';
import { sounds } from '../lib/sounds';
import RehabilitationForm from './RehabilitationForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import RecoveryCodeReveal from './RecoveryCodeReveal';

// لازم يفضل متطابق مع MIN_PASSWORD_LENGTH في backend/src/lib/auth.ts
const MIN_PASSWORD_LENGTH = 10;

// تقييم بسيط لقوة كلمة المرور على جهاز المستخدم نفسه (مفيش أي إرسال أو
// تخزين) — مجرد مؤشر بصري يساعده يختار كلمة مرور أقوى قبل ما يبعتها أصلاً.
function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 12) score++;
  const varietyCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(password)).length;
  if (varietyCount >= 3) score++;

  if (password.length < MIN_PASSWORD_LENGTH) return { score: 0, label: 'قصيرة جدًا' };
  if (score <= 1) return { score: 1, label: 'ضعيفة' };
  if (score === 2) return { score: 2, label: 'متوسطة' };
  return { score: 3, label: 'قوية' };
}

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

  // ===== خطوة التحقق بخطوتين (2FA) — بتظهر بس لو الحساب أدمن ومفعّل عليه =====
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);

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
        const data = await register(username.trim(), password);
        sounds.success();
        setPendingSuccess({ username: data.username, isAdmin: !!data.isAdmin, token: data.token });
        setRevealCode(data.recoveryCode);
        return;
      }

      const data = await login(username.trim(), password);

      if (data.requiresRehabilitation) {
        sounds.click();
        setRehabToken(data.rehabToken);
        return;
      }
      if (data.requiresTwoFactor) {
        sounds.click();
        setPendingToken(data.pendingToken);
        return;
      }
      sounds.success();
      localStorage.setItem('token', data.token);
      onSuccess(data.username, !!data.isAdmin);
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : 'حصل خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingToken || !twoFactorCode) return;
    setTwoFactorError(null);
    setTwoFactorLoading(true);
    try {
      const data = await verifyLoginTwoFactor(pendingToken, twoFactorCode.trim());
      sounds.success();
      localStorage.setItem('token', data.token);
      onSuccess(data.username, !!data.isAdmin);
    } catch (err) {
      sounds.error();
      setTwoFactorError(err instanceof Error ? err.message : 'الكود غلط');
    } finally {
      setTwoFactorLoading(false);
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

  if (pendingToken) {
    return (
      <div className="auth-container">
        <h1>التحقق بخطوتين</h1>
        <form onSubmit={handleVerifyTwoFactor} className="auth-form">
          <p className="modal-text modal-hint">
            اكتب الكود المكوّن من 6 أرقام من تطبيق المصادقة، أو أحد أكواد الاسترجاع لو فاقد جهازك.
          </p>
          <input
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            autoFocus
            required
          />
          {twoFactorError && <p className="error">⚠️ {twoFactorError}</p>}
          <button type="submit" disabled={twoFactorLoading || !twoFactorCode}>
            {twoFactorLoading ? 'جاري التحقق...' : 'تأكيد الدخول'}
          </button>
          <button
            type="button"
            className="small"
            onClick={() => {
              setPendingToken(null);
              setTwoFactorCode('');
              setTwoFactorError(null);
            }}
          >
            رجوع لتسجيل الدخول
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <h1>قائمة المهام</h1>
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
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {mode === 'register' && password.length > 0 && (
            <div className={`password-strength strength-${strength.score}`}>
              <span className="password-strength-bar">
                <span />
                <span />
                <span />
              </span>
              <span className="password-strength-label">{strength.label}</span>
            </div>
          )}
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

        {error && <p className="error">⚠️ {error}</p>}

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
