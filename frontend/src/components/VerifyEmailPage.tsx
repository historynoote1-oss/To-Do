import { useEffect, useState } from 'react';
import { verifyEmail } from '../lib/api';

export default function VerifyEmailPage({ token, onDone }: { token: string; onDone: () => void }) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    verifyEmail(token)
      .then((data) => {
        if (!cancelled) {
          setStatus('success');
          setMessage(data.message);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'حصل خطأ غير متوقع');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="auth-container">
      <h1>تأكيد البريد الإلكتروني</h1>
      <div className="auth-form">
        {status === 'loading' && <p className="modal-text modal-hint">جاري التأكيد...</p>}
        {status === 'success' && <p className="modal-text modal-hint">✅ {message}</p>}
        {status === 'error' && <p className="error">⚠️ {message}</p>}
        <button type="button" onClick={onDone}>
          الذهاب للموقع
        </button>
      </div>
    </div>
  );
}
