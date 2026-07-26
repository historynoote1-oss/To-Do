// نمط pub/sub بسيط كان متكرر بنفس الشكل بالظبط في services/audio/sounds.ts
// وutils/theme.ts: Set من المستمعين + subscribe بيرجّع دالة إلغاء الاشتراك
// + emit بينادي كل المستمعين بالحالة الحالية.
export function createListenerSet<T>() {
  const listeners = new Set<(value: T) => void>();

  return {
    subscribe(listener: (value: T) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(value: T): void {
      listeners.forEach((l) => l(value));
    },
  };
}
