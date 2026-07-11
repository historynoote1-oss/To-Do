import { useState } from 'react';
import { login, register } from '../lib/api';
import { sounds } from '../lib/sounds';

export default function AuthForm({
  onSuccess,
}: {
  onSuccess: (username: string, isAdmin: boolean) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const fn = mode === 'login' ? login : register;
      const data = await fn(username.trim(), password);
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

  return (
    <div className="auth-container">
      <h1>قائمة المهام</h1>
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
