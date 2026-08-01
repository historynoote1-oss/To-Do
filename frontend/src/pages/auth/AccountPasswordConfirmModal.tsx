import PasswordConfirmModal from '@/components/common/PasswordConfirmModal';

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
// تبعياته من خريطة الأهداف. الشكل والمنطق الفعليين في PasswordConfirmModal
// المشترك؛ الملف ده بس بيثبّت نصوص/سياق المستخدم العادي.
export default function AccountPasswordConfirmModal({
  title,
  description,
  confirmLabel = 'تأكيد الحذف نهائيًا',
  danger = true,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <PasswordConfirmModal
      title={title}
      description={description}
      danger={danger}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmLabel={confirmLabel}
      loadingLabel="جاري الحذف..."
      passwordHint="اكتب كلمة مرور حسابك للتأكيد النهائي:"
      passwordPlaceholder="كلمة مرور حسابك"
    />
  );
}
