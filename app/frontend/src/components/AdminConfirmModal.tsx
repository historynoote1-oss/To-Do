import { useState } from 'react';

interface Props {
  title: string;
  description: React.ReactNode;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (adminPassword: string) => Promise<void>;
}

// نافذة تأكيد موحّدة لأي إجراء حساس في لوحة الأدمن (حذف، تعليق، تعديل صلاحيات،
// تغيير إعدادات الموقع...) — بتطلب كلمة مرور الأدمن نفسها في كل مرة، بغض النظر
// عن الصفحة اللي الإجراء جاي منها.
export default function AdminConfirmModal({ title, description, danger, onCancel, onConfirm }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!password) return;
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
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="modal-text">{description}</div>
        <p className="modal-text modal-hint">اكتب كلمة مرورك انت (الأدمن) للتأكيد:</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة مرور الأدمن"
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
            {loading ? 'جاري التنفيذ...' : 'تأكيد وتنفيذ'}
          </button>
        </div>
      </div>
    </div>
  );
}
