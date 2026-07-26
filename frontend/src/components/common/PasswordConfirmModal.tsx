import { useState } from 'react';
import Portal from '@/components/common/Portal';

interface Props {
  title: string;
  description?: React.ReactNode;
  // نص التلميح فوق الحقل ("اكتب كلمة مرورك انت (الأدمن)..." أو "...حسابك")
  passwordHint: string;
  passwordPlaceholder: string;
  confirmLabel?: string;
  loadingLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}

// نافذة تأكيد موحّدة لأي إجراء حساس بيحتاج "تأكيد بكلمة مرور" (step-up
// authentication) — سواء كانت كلمة مرور الأدمن (لوحة الأدمن) أو كلمة مرور
// المستخدم العادي نفسه (حذف نهائي في خريطة الأهداف). كانت AdminConfirmModal
// وAccountPasswordConfirmModal نفس المكوّن بالحرف الواحد تقريبًا، فرق بينهم
// بس نصوص التلميح/الـ placeholder وتغليف الـ Portal.
export default function PasswordConfirmModal({
  title,
  description,
  passwordHint,
  passwordPlaceholder,
  confirmLabel = 'تأكيد وتنفيذ',
  loadingLabel = 'جاري التنفيذ...',
  danger = true,
  onCancel,
  onConfirm,
}: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت العملية');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Portal>
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
          <h2>{title}</h2>
          {description && <div className="modal-text">{description}</div>}
          <p className="modal-text modal-hint">{passwordHint}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={passwordPlaceholder}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          />
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button className="small" onClick={onCancel} type="button">
              إلغاء
            </button>
            <button
              className={danger ? 'danger small' : 'small'}
              onClick={handleConfirm}
              disabled={!password || loading}
              type="button"
            >
              {loading ? loadingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
