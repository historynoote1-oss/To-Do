import { ReactNode, useCallback, useEffect, useState } from 'react';
import { DynamicIcon } from '@/lib/core/icons';
import {
  isNativeApp,
  getPrayerPermissionsStatus,
  requestNotificationPermission,
  openExactAlarmSettings,
  openBatteryOptimizationSettings,
  openDndAccessSettings,
  PrayerPermissionsStatus,
} from '@/lib/audio/nativeAdhan';

interface PermissionItem {
  key: keyof Omit<PrayerPermissionsStatus, 'allGranted'>;
  icon: string;
  title: string;
  description: string;
  action: () => void | Promise<void>;
  actionLabel: string;
}

// ===== شاشة "أذونات الأذان" — بتظهر بدل محتوى الصفحة بالكامل (جوه
// التطبيق APK بس) لحد ما المستخدم يفعّل الأذونات الأربعة دي كلها. السبب:
// من غيرهم مجتمعين، الأذان و/أو التذكيرات ممكن ميشتغلوش بشكل موثوق لما
// التطبيق يبقى مقفول تمامًا — فبدل ما نسيب المستخدم يظن إن كل حاجة شغالة
// ومفاجأة إنها متأخرة أو مش هتيجي أصلًا، بنمنعه من الوصول للإعدادات نفسها
// إلا بعد ما يضمنها. في نسخة المتصفح (مش APK) الشاشة دي متعرضش خالص —
// أصلًا مفيش ضمانة تشغيل من غير ما التاب يفضل مفتوح بغض النظر عن أي إذن.
export default function PrayerPermissionsGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PrayerPermissionsStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    if (!isNativeApp()) {
      setStatus(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const s = await getPrayerPermissionsStatus();
    setStatus(s);
    setChecking(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // لما المستخدم يرجع للتطبيق بعد ما فتح شاشة إعدادات النظام (زي "استثناء
  // البطارية")، بنعيد الفحص تلقائيًا من غير ما يحتاج يدوس زرار — أول ما
  // التطبيق يرجع يبقى في الواجهة (visible) بنتحقق تاني.
  useEffect(() => {
    if (!isNativeApp()) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  // مش تطبيق native، أو لسه بنفحص لأول مرة — من غير ما نومض بالشاشة دي
  // لثانية ونخفيها، منستناش نعرض المحتوى غير بعد أول فحص يخلص.
  if (!isNativeApp()) return <>{children}</>;
  if (checking && !status) {
    return (
      <div className="prayer-gate-loading">
        <DynamicIcon name="loader" size={20} className="spin" />
        جاري التحقق من الأذونات...
      </div>
    );
  }
  if (status?.allGranted) return <>{children}</>;

  const items: PermissionItem[] = [
    {
      key: 'notifications',
      icon: 'bell',
      title: 'إذن الإشعارات',
      description: 'من غيره، إشعار الأذان والتذكيرات مش هيظهر خالص على شاشتك.',
      action: async () => {
        await requestNotificationPermission();
        await refresh();
      },
      actionLabel: 'تفعيل الإذن',
    },
    {
      key: 'exactAlarms',
      icon: 'timer',
      title: 'الإنذارات الدقيقة',
      description: 'عشان الأذان والتذكيرات يدقّوا في معادهم بالظبط، مش متأخرين بدقايق.',
      action: openExactAlarmSettings,
      actionLabel: 'فتح الإعدادات',
    },
    {
      key: 'batteryOptimizationIgnored',
      icon: 'zap',
      title: 'استثناء توفير البطارية',
      description: 'من غيره، نظام أندرويد ممكن يوقف التطبيق في الخلفية قبل ما الأذان يشتغل.',
      action: openBatteryOptimizationSettings,
      actionLabel: 'فتح الإعدادات',
    },
    {
      key: 'dndAccess',
      icon: 'moon-star',
      title: 'تخطي وضع "عدم الإزعاج"',
      description: 'عشان صوت الأذان يوصلك حتى لو الجهاز شغّال وضع عدم الإزعاج.',
      action: openDndAccessSettings,
      actionLabel: 'فتح الإعدادات',
    },
  ];

  return (
    <div className="prayer-gate-page">
      <div className="prayer-gate-hero">
        <span className="prayer-gate-hero-icon">
          <DynamicIcon name="shield-check" size={30} />
        </span>
        <h2>خلّي الأذان والتذكيرات يشتغلوا صح</h2>
        <p>
          فعّل الأذونات الأربعة دي مرة واحدة بس عشان نضمن إن الأذان وتذكيرات الصلاة تشتغل في معادها بالظبط، حتى لو
          قفلت التطبيق تمامًا.
        </p>
      </div>

      <div className="prayer-gate-list">
        {items.map((item) => {
          const granted = status?.[item.key] ?? false;
          return (
            <div key={item.key} className={`prayer-gate-item ${granted ? 'is-granted' : ''}`}>
              <span className="prayer-gate-item-icon">
                <DynamicIcon name={granted ? 'check-circle' : item.icon} size={20} />
              </span>
              <div className="prayer-gate-item-body">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
              {granted ? (
                <span className="prayer-gate-item-status">مفعّل</span>
              ) : (
                <button type="button" className="prayer-gate-item-btn" onClick={item.action}>
                  {item.actionLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="prayer-gate-refresh" onClick={refresh} disabled={checking}>
        <DynamicIcon name={checking ? 'loader' : 'refresh-cw'} size={15} className={checking ? 'spin' : ''} />
        {checking ? 'جاري التحقق...' : 'تحقق من الأذونات الآن'}
      </button>
    </div>
  );
}
