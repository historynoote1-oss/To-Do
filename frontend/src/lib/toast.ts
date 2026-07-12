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
