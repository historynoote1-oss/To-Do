import PasswordConfirmModal from '@/components/common/PasswordConfirmModal';

interface Props {
  title: string;
  description: React.ReactNode;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (adminPassword: string) => Promise<void>;
}

// نافذة تأكيد موحّدة لأي إجراء حساس في لوحة الأدمن (حذف، تعليق، تعديل صلاحيات،
// تغيير إعدادات الموقع...) — بتطلب كلمة مرور الأدمن نفسها في كل مرة، بغض النظر
// عن الصفحة اللي الإجراء جاي منها. الشكل والمنطق الفعليين في
// PasswordConfirmModal المشترك؛ الملف ده بس بيثبّت نصوص/سياق الأدمن.
export default function AdminConfirmModal({ title, description, danger, onCancel, onConfirm }: Props) {
  return (
    <PasswordConfirmModal
      title={title}
      description={description}
      danger={danger}
      onCancel={onCancel}
      onConfirm={onConfirm}
      passwordHint="اكتب كلمة مرورك انت (الأدمن) للتأكيد:"
      passwordPlaceholder="كلمة مرور الأدمن"
    />
  );
}
