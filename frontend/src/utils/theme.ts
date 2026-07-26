import { useCallback, useEffect, useState } from 'react';
import { createListenerSet } from '@/utils/listenerSet';

export type Theme = 'light' | 'dark';
// تفضيل المستخدم المخزَّن: تفضيل يدوي صريح (فاتح/غامق) أو "تبعية لثيم
// النظام" (مفيش تفضيل محفوظ أصلًا). صفحة الإعدادات بتتعامل مع النوع ده،
// بينما useTheme القديم بيتعامل مع الثيم *المطبَّق فعليًا* بس (Theme).
export type ThemePreference = Theme | 'system';

const THEME_KEY = 'theme';
const LIGHT_META_COLOR = '#f8f6fd';
const DARK_META_COLOR = '#0a0714';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

// تفضيل المستخدم الحالي — 'system' لو مفيش تفضيل يدوي محفوظ.
export function getThemePreference(): ThemePreference {
  return getStoredTheme() ?? 'system';
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
  void import('@/utils/nativeShell').then(({ syncStatusBar }) => syncStatusBar(theme));
}

// مستمعين خارجيين: أي مكوّن بيستخدم useTheme (زرار الهيدر، القائمة
// الجانبية، صفحة الإعدادات...) بيفضل متزامن لحظيًا مع أي تغيير حصل من
// مكوّن تاني — نفس فكرة نظام الاشتراك في services/audio/sounds.ts بالظبط.
type ThemeListener = (theme: Theme) => void;
const themeStore = createListenerSet<Theme>();
const emitChange = themeStore.emit;

// بيسمح لأي كود (مش بس مكوّنات React) يتابع تغييرات الثيم لحظيًا.
export const subscribeTheme: (listener: ThemeListener) => () => void = themeStore.subscribe;

// بيحدّد تفضيل المستخدم الكامل بما فيه "تبعية للنظام" — ده اللي بتستخدمه
// صفحة الإعدادات (فاتح/غامق/تلقائي) بدل toggleTheme/setTheme القديمين
// اللي بيدعموا بس فاتح/غامق صريحين.
export function setThemePreference(pref: ThemePreference) {
  if (typeof window === 'undefined') return;
  if (pref === 'system') {
    window.localStorage.removeItem(THEME_KEY);
    emitChange(getSystemTheme());
  } else {
    window.localStorage.setItem(THEME_KEY, pref);
    emitChange(pref);
  }
}

export function useTheme(): [Theme, () => void, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // بيتابع أي تغيير ثيم حصل من مكوّن تاني (مثلًا صفحة الإعدادات) ويحدّث
  // الحالة المحلية هنا فورًا، بدل ما يفضل المكوّن ده واقف على قيمة قديمة
  // لحد ما يتعمل له remount.
  useEffect(() => subscribeTheme(setThemeState), []);

  // لو المستخدم لسه ماحددش تفضيل يدوي، تابع تغييرات ثيم النظام تلقائيًا
  useEffect(() => {
    if (getStoredTheme() || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? 'dark' : 'light';
      setThemeState(next);
      emitChange(next);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem(THEME_KEY, next);
    setThemeState(next);
    emitChange(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(THEME_KEY, next);
      emitChange(next);
      return next;
    });
  }, []);

  return [theme, toggleTheme, setTheme];
}

// نسخة "تفضيل" من useTheme لصفحة الإعدادات: بترجع فاتح/غامق/تلقائي (مش
// بس الثيم المطبَّق فعليًا)، عشان زرار "تلقائي (حسب النظام)" يقدر يظهر
// كاختيار فعلي قائم بذاته بدل ما يختفي جوه فاتح/غامق.
export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(() => getThemePreference());

  useEffect(() => subscribeTheme(() => setPref(getThemePreference())), []);

  const setPreference = useCallback((next: ThemePreference) => {
    setThemePreference(next);
    setPref(next);
  }, []);

  return [pref, setPreference];
}
