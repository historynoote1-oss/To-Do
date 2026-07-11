import { useEffect, useState } from 'react';
import { toast, ToastMessage } from '../lib/toast';

const ICONS: Record<ToastMessage['kind'], string> = {
  success: '✓',
  error: '!',
  info: 'ℹ',
};

export default function ToastContainer() {
  const [items, setItems] = useState<ToastMessage[]>([]);

  useEffect(() => toast.subscribe(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => toast.dismiss(t.id)}>
          <span className="toast-icon">{ICONS[t.kind]}</span>
          <span className="toast-text">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
