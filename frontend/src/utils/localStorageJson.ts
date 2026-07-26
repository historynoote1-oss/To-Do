// أدوات عامة لقراءة/كتابة JSON في localStorage بأمان (بيتجاهل أي خطأ
// بهدوء — تخزين محلي معطّل أو ممتلئ مش لازم يكسر التطبيق). كان نفس نمط
// try/JSON.stringify/localStorage.setItem/catch متكرر في saveSettings بتاع
// pomodoro.tsx وprayerTimesStore.tsx.

export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // تخزين محلي مش متاح (وضع خاص، مساحة ممتلئة...) — نتجاهل بهدوء.
  }
}
