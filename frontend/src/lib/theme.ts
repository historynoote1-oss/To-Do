import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'theme';
const LIGHT_META_COLOR = '#f1eee5';
const DARK_META_COLOR = '#0c1013';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function getInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

// بتطبّق الثيم فعليًا على الصفحة (يُستخدم هنا وكمان في السكريبت اللي بيشتغل
// قبل ما الـ React يبدأ، عشان نتجنب "وميض" الثيم الغلط عند التحميل).
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'dark' ? DARK_META_COLOR : LIGHT_META_COLOR);
  }

  // لو شغالين جوه التطبيق الأصلي (أندرويد)، شريط الحالة فوق بيتلوّن بنفس
  // لون الثيم الجديد فورًا — بدون الاستيراد ده هيفضل بلون الثيم القديم
  // لحد ما تعمل reload كامل للتطبيق.
  void import('./nativeShell').then(({ syncStatusBar }) => syncStatusBar(theme));
}

export function useTheme(): [Theme, () => void, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // لو المستخدم لسه ماحددش تفضيل يدوي، تابع تغييرات ثيم النظام تلقائيًا
  useEffect(() => {
    if (getStoredTheme() || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setThemeState(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  return [theme, toggleTheme, setTheme];
}
