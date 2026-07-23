import { useEffect, useState } from 'react';
import { toast, ToastMessage } from '@/lib/core/toast';
import { CheckCircle2, AlertCircle, Info, Bell, type LucideIcon } from 'lucide-react';

const ICONS: Record<ToastMessage['kind'], LucideIcon> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  reminder: Bell,
};

export default function ToastContainer() {
  const [items, setItems] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe(setItems);
    return () => {
      unsubscribe();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => toast.dismiss(t.id)}>
            <span className="toast-icon">
              <Icon size={16} aria-hidden="true" />
            </span>
            <span className="toast-text">{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
