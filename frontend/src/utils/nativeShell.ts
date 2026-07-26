// طبقة التكامل مع الغلاف الأصلي (Capacitor) على أندرويد. كل حاجة هنا
// بتتفعّل بس لو التطبيق شغال جوه غلاف Capacitor فعلي (Capacitor.isNativePlatform())
// — لو شغال في متصفح عادي (dev أو نسخة الويب) كل الدوال دي بترجع فورًا
// من غير أي تأثير، فمفيش داعي لأي "if" في أماكن الاستخدام.
//
// الهدف: يحس المستخدم إنه فاتح تطبيق حقيقي مش موقع جوه ويب فيو —
// شريط الحالة بلون الواجهة، شاشة بداية بتختفي بسلاسة، اهتزاز خفيف على
// اللمسات المهمة، وزرار الرجوع الفيزيائي بيرجّع بين الشاشات بدل ما يقفل
// التطبيق فجأة.

import { Capacitor } from '@capacitor/core';

const isNative = () => Capacitor.isNativePlatform();

// ===== شريط الحالة (Status Bar) =====
// بيتلوّن بنفس لون خلفية الهيدر الحالي (فاتح/غامق) عشان يبقى امتداد طبيعي
// للواجهة بدل شريط أسود/أبيض غريب فوقها. بيتنادى من applyTheme في theme.ts
// كل ما الثيم يتغيّر، وكمان مرة واحدة عند الإقلاع.
const STATUS_BAR_COLORS: Record<'light' | 'dark', string> = {
  light: '#f8f6fd',
  dark: '#0a0714',
};

export async function syncStatusBar(theme: 'light' | 'dark') {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setBackgroundColor({ color: STATUS_BAR_COLORS[theme] });
    // Style.Dark = نص/أيقونات فاتحة (لخلفية غامقة)، Style.Light = نص غامق
    // (لخلفية فاتحة) — عكس اسم الثيم بالظبط، فبنعكسه هنا قصدًا.
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
  } catch {
    // البلجن مش متاح (مثلاً وقت التطوير جوه متصفح ديسكتوب) — تجاهل بأمان
  }
}

// ===== شاشة البداية (Splash Screen) =====
// بتتقفل يدويًا (مش أوتوماتيك) عشان تفضل ظاهرة لحد ما أول شاشة فعلية
// (المهام أو تسجيل الدخول) تخلص تحميل بياناتها، بدل ما تختفي بدري وتوريه
// شاشة بيضاء فاضية للحظة قبل المحتوى — ده اللي بيدي إحساس "تطبيق سريع
// ومصقول" بدل "موقع بيلحق نفسه".
export async function hideSplash() {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    // تجاهل بأمان
  }
}

// ===== الاهتزاز (Haptics) =====
// استخدامات مقترحة: impact('light') عند تحديد/إلغاء مهمة، success() عند
// إتمام حفظ أو إنشاء عنصر، warning() عند رفض إجراء، error() عند فشل طلب،
// selection() عند التنقل بين تبويبات أو فتح/قفل القوائم.
export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    await Haptics.impact({ style: map[style] });
  } catch {
    // تجاهل بأمان
  }
}

export async function hapticNotification(type: 'success' | 'warning' | 'error') {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    const map = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    };
    await Haptics.notification({ type: map[type] });
  } catch {
    // تجاهل بأمان
  }
}

export async function hapticSelection() {
  if (!isNative()) return;
  try {
    const { Haptics } = await import('@capacitor/haptics');
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  } catch {
    // تجاهل بأمان
  }
}

// ===== زرار الرجوع الفيزيائي (Android Hardware Back Button) =====
// بدون التكامل ده، زرار الرجوع في أندرويد بيقفل التطبيق فورًا من أي
// شاشة — سلوك موقع جوه ويب فيو، مش سلوك تطبيق. بعد التكامل: لو فيه شاشة
// سابقة في تاريخ التنقل (احنا أصلاً بنستخدم pushState/popstate في
// routes.ts) الزرار بيرجّع لها زي زرار الرجوع الظاهر على الشاشة بالظبط،
// ولو احنا على الشاشة الرئيسية (مفيش رجوع تاني) الزرار بيقفل التطبيق
// فعليًا زي أي تطبيق أندرويد عادي.
//
// onExitAttempt اختياري: بيتنادى قبل الخروج مباشرة، ممكن يتستخدم مثلاً
// لإظهار "اضغط تاني للخروج" بدل خروج فوري من أول ضغطة (مطبّق تحت).
let backButtonListenerAttached = false;

export async function attachHardwareBackButton(options?: {
  canGoBack: () => boolean;
  onExitAttempt?: () => boolean; // رجّع true للسماح بالخروج، false لمنعه
}) {
  if (!isNative() || backButtonListenerAttached) return;
  backButtonListenerAttached = true;
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      const canGoBack = options?.canGoBack?.() ?? window.history.length > 1;
      if (canGoBack) {
        window.history.back();
        return;
      }
      const allowExit = options?.onExitAttempt?.() ?? true;
      if (allowExit) {
        App.exitApp();
      }
    });
  } catch {
    backButtonListenerAttached = false;
  }
}

// ===== "اضغط تاني للخروج" =====
// نمط شائع في تطبيقات أندرويد: أول ضغطة على زرار الرجوع وإنت على
// الشاشة الرئيسية بتوري تنبيه بسيط بدل ما تقفل التطبيق فورًا، وثاني
// ضغطة خلال ثانيتين بتأكد الخروج فعليًا. بيمنع الخروج بالغلط لمستخدم
// دوس زرار الرجوع وهو مقصود يعمل حاجة تانية.
let lastBackPressAt = 0;
export function confirmExitOnDoubleBack(showHint: () => void): boolean {
  const now = Date.now();
  if (now - lastBackPressAt < 2000) {
    return true; // ضغطة تانية خلال ثانيتين — يسمح بالخروج
  }
  lastBackPressAt = now;
  showHint();
  return false; // ضغطة أولى — يمنع الخروج ويوري التلميح
}

// ===== نقطة الإقلاع الموحدة =====
// بتتنادى مرة واحدة بس من main.tsx. بتزبط شريط الحالة على الثيم الحالي
// فورًا (قبل ما React يخلص أول render) عشان مفيش وميض لون غلط.
export function initNativeShell(theme: 'light' | 'dark') {
  if (!isNative()) return;
  void syncStatusBar(theme);
}
