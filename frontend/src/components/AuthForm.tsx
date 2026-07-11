import { useState } from 'react';
import { login, register, verifyLoginTwoFactor } from '../lib/api';
import { sounds } from '../lib/sounds';

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ===== خطوة التحقق بخطوتين (2FA) — بتظهر بس لو الحساب أدمن ومفعّل عليه =====
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const fn = mode === 'login' ? login : register;
      const data = await fn(username.trim(), password);
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
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="اسم المستخدم"
          autoComplete="username"
          required
        />
        <div className="input-wrapper">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور"
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
        {error && <p className="error">⚠️ {error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'جاري التحميل...' : mode === 'login' ? 'دخول' : 'إنشاء حساب'}
        </button>
      </form>
    </div>
  );
}
