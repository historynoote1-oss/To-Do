import { useState } from 'react';
import { forgotPassword } from '../lib/api';
import { sounds } from '../lib/sounds';

export default function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const data = await forgotPassword(identifier.trim());
      sounds.success();
      setSent(data.message);
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : 'حصل خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <h1>نسيت كلمة المرور</h1>
      {sent ? (
        <div className="auth-form">
          <p className="modal-text modal-hint">✅ {sent}</p>
          <button type="button" onClick={onBack}>
            رجوع لتسجيل الدخول
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <p className="modal-text modal-hint">اكتب اسم المستخدم أو الإيميل بتاعك، وهنبعتلك رابط إعادة تعيين كلمة المرور.</p>
          <div className="field-group">
            <label htmlFor="forgot-identifier" className="sr-only">
              اسم المستخدم أو الإيميل
            </label>
            <input
              id="forgot-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="اسم المستخدم أو الإيميل"
              autoFocus
              required
            />
          </div>
          {error && <p className="error">⚠️ {error}</p>}
          <button type="submit" disabled={loading || !identifier.trim()}>
            {loading ? 'جاري الإرسال...' : 'إرسال رابط إعادة التعيين'}
          </button>
          <button type="button" className="small" onClick={onBack}>
            رجوع لتسجيل الدخول
          </button>
        </form>
      )}
    </div>
  );
}
