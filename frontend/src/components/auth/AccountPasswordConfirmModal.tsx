import { useState } from 'react';
import Portal from '@/components/common/Portal';

interface Props {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}

// نافذة تأكيد أخيرة بكلمة مرور الحساب نفسه (مش الأدمن) — خطوة إضافية بعد
// تأكيد الحذف العادي لأي إجراء نهائي مينفعش يترجع، زي حذف هدف بكل
// تبعياته من خريطة الأهداف. نفس فكرة AdminConfirmModal بالظبط بس بصياغة
// تخص المستخدم العادي (كلمة مرور حسابه هو، مش أدمن).
export default function AccountPasswordConfirmModal({
  title,
  description,
  confirmLabel = 'تأكيد الحذف نهائيًا',
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
          <p className="modal-text modal-hint">اكتب كلمة مرور حسابك للتأكيد النهائي:</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة مرور حسابك"
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
              {loading ? 'جاري الحذف...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
