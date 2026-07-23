import Portal from '@/components/common/Portal';
import { hapticNotification } from '@/lib/core/nativeShell';

interface Props {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// نافذة تأكيد بسيطة وسريعة للإجراءات الحساسة على مستوى المستخدم العادي
// (حذف مهمة رئيسية/فرعية)، من غير الحاجة لكلمة مرور زي نافذة الأدمن.
export default function ConfirmModal({
  title,
  description,
  confirmLabel = 'حذف',
  cancelLabel = 'إلغاء',
  danger = true,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Portal>
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
          <h2>{title}</h2>
          {description && <div className="modal-text">{description}</div>}
          <div className="modal-actions">
            <button className="small" onClick={onCancel} type="button" autoFocus>
              {cancelLabel}
            </button>
            <button
              className={danger ? 'danger small' : 'small'}
              onClick={() => {
                if (danger) void hapticNotification('warning');
                onConfirm();
              }}
              type="button"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
