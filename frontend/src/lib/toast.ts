import { hapticNotification } from './nativeShell';

export type ToastKind = 'success' | 'error' | 'info' | 'reminder';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

type Listener = (toasts: ToastMessage[]) => void;

let toasts: ToastMessage[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(toasts));
}

function push(kind: ToastKind, text: string, duration = 3600) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, text }];
  emit();
  // اهتزاز مناسب لنوع الرسالة — مركزي هنا بدل ما يتضاف يدويًا عند كل نداء
  // toast.error/success في المشروع (عشرات الأماكن)، فأي toast جديد يتضاف
  // بعدين ياخد الاهتزاز الصحيح تلقائيًا من غير ما حد يفتكر يضيفه بنفسه.
  if (kind === 'error') void hapticNotification('error');
  else if (kind === 'success') void hapticNotification('success');
  else if (kind === 'reminder') void hapticNotification('warning');
  window.setTimeout(() => dismiss(id), duration);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success(text: string) {
    push('success', text);
  },
  error(text: string) {
    push('error', text);
  },
  info(text: string) {
    push('info', text);
  },
  reminder(text: string) {
    push('reminder', text, 7000);
  },
  dismiss,
  subscribe(listener: Listener) {
    listeners.add(listener);
    listener(toasts);
    return () => listeners.delete(listener);
  },
};
