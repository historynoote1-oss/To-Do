import { useEffect, useState } from 'react';
import { DynamicIcon } from '@/lib/core/icons';
import {
  isNativeApp,
  canScheduleExactAlarms,
  openExactAlarmSettings,
  openBatteryOptimizationSettings,
  openDndAccessSettings,
} from '@/lib/audio/nativeAdhan';

// قسم "صلاحيات الأذان" — بيظهر بس جوه التطبيق (APK)، مش في نسخة
// المتصفح، لأن الصلاحيات دي أصلًا مالهاش معنى في الويب. كل زرار هنا
// بيفتح شاشة نظام Android محددة، وده مقصود إنه يبقى فعل صريح من
// المستخدم (تاب) بدل ما التطبيق ينقله لبره من غير استئذان.
export default function PrayerNativePermissions() {
  const [exactAlarmsOk, setExactAlarmsOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    canScheduleExactAlarms().then(setExactAlarmsOk);
  }, []);

  if (!isNativeApp()) return null;

  return (
    <div className="prayer-native-permissions">
      <div className="prayer-section-title">
        <span className="prayer-section-title-main">
          <DynamicIcon name="shield-check" size={16} />
          صلاحيات الأذان في الخلفية
        </span>
      </div>
      <p className="prayer-note">
        <DynamicIcon name="info" size={13} /> عشان الأذان يشتغل بصوت وإشعار حتى لو التطبيق مقفول تمامًا، فعّل الصلاحيات الثلاثة دي مرة واحدة بس:
      </p>

      <button type="button" className="prayer-permission-btn" onClick={async () => { await openExactAlarmSettings(); setExactAlarmsOk(await canScheduleExactAlarms()); }}>
        <DynamicIcon name={exactAlarmsOk ? 'check-circle' : 'timer'} size={16} />
        <span>الإنذارات الدقيقة (Alarms &amp; reminders){exactAlarmsOk ? ' — مفعّلة' : ''}</span>
      </button>

      <button type="button" className="prayer-permission-btn" onClick={() => openBatteryOptimizationSettings()}>
        <DynamicIcon name="zap" size={16} />
        <span>استثناء توفير البطارية (عشان النظام ميوقفش التطبيق في الخلفية)</span>
      </button>

      <button type="button" className="prayer-permission-btn" onClick={() => openDndAccessSettings()}>
        <DynamicIcon name="bell" size={16} />
        <span>الوصول لوضع "عدم الإزعاج" (عشان الأذان يتخطاه فعليًا)</span>
      </button>
    </div>
  );
}
