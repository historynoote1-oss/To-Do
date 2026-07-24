// جسر بسيط بين الواجهة وبين البلجن الـ Native (AdhanAlarmPlugin.kt).
// لما التطبيق شغال جوه المتصفح العادي (مش تطبيق أندرويد) بيرجع كل
// الدوال no-op من غير ما يعمل كراش، عشان نفس الكود يشتغل في الحالتين.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { DayTimings, PRAYER_LABELS, PRAYER_ORDER } from '@/lib/prayer/prayerTimes';

export interface NativeAdhanAlarmInput {
  key: string;
  label: string;
  timestamp: number; // epoch ms
  soundResource: string;
}

interface PermissionsStatusResult {
  notifications: boolean;
  exactAlarms: boolean;
  batteryOptimizationIgnored: boolean;
  dndAccess: boolean;
}

interface AdhanAlarmPluginApi {
  scheduleAlarms(options: { alarms: NativeAdhanAlarmInput[] }): Promise<{ scheduled: number }>;
  cancelAlarms(): Promise<void>;
  canScheduleExactAlarms(): Promise<{ value: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  openBatteryOptimizationSettings(): Promise<void>;
  openDndAccessSettings(): Promise<void>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  checkNotificationPermission(): Promise<{ granted: boolean }>;
  isIgnoringBatteryOptimizations(): Promise<{ value: boolean }>;
  isNotificationPolicyAccessGranted(): Promise<{ value: boolean }>;
  getPermissionsStatus(): Promise<PermissionsStatusResult>;
}

const AdhanAlarmNative = registerPlugin<AdhanAlarmPluginApi>('AdhanAlarm');

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/**
 * بيجدول أذان اليوم الحالي على مستوى النظام (AlarmManager) عشان يشتغل
 * حتى لو التطبيق مقفول تمامًا. لازم يتنادى في كل مرة مواقيت اليوم تتغير
 * أو الإعدادات (تشغيل تلقائي / صوت مختار) تتغير.
 */
export async function scheduleNativeAdhanForDay(
  timings: DayTimings,
  soundResource: string,
  autoPlayEnabled: boolean
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    if (!autoPlayEnabled) {
      await AdhanAlarmNative.cancelAlarms();
      return;
    }
    const now = Date.now();
    const alarms: NativeAdhanAlarmInput[] = PRAYER_ORDER
      .filter((key) => timings.times[key].getTime() > now)
      .map((key) => ({
        key,
        label: PRAYER_LABELS[key],
        timestamp: timings.times[key].getTime(),
        soundResource,
      }));
    await AdhanAlarmNative.scheduleAlarms({ alarms });
  } catch {
    // لو البلجن مش متسجل (مثلاً build قديم قبل إضافة الكود الـ Native)
    // بنتجاهل بهدوء والتايمر الاحتياطي في JS هيفضل شغال طول ما الصفحة مفتوحة.
  }
}

export async function cancelNativeAdhan(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await AdhanAlarmNative.cancelAlarms();
  } catch {
    // تجاهل
  }
}

/**
 * بتتنادى مرة واحدة بس عند فتح التطبيق: بتطلب صلاحية الإشعارات (Dialog
 * نظامي عادي، غير مزعج). أما فتح شاشات "الإنذارات الدقيقة"/"استثناء
 * البطارية"/"عدم الإزعاج" فمقصود عمدًا إنها متفتحش تلقائيًا (تنقل
 * المستخدم بره التطبيق من غير ما يفهم ليه) — دي متاحة كأزرار صريحة في
 * قسم "صلاحيات الأذان" في الواجهة (شوف PrayerPermissionsGate.tsx).
 */
export async function ensureNativeAdhanPermissions(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await AdhanAlarmNative.requestNotificationPermission();
  } catch {
    // تجاهل
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    const { granted } = await AdhanAlarmNative.requestNotificationPermission();
    return granted;
  } catch {
    return false;
  }
}

export async function canScheduleExactAlarms(): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    const { value } = await AdhanAlarmNative.canScheduleExactAlarms();
    return value;
  } catch {
    return true;
  }
}

export async function openExactAlarmSettings(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await AdhanAlarmNative.openExactAlarmSettings();
  } catch {
    // تجاهل
  }
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await AdhanAlarmNative.openBatteryOptimizationSettings();
  } catch {
    // تجاهل
  }
}

export async function openDndAccessSettings(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await AdhanAlarmNative.openDndAccessSettings();
  } catch {
    // تجاهل
  }
}

export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    const { value } = await AdhanAlarmNative.isIgnoringBatteryOptimizations();
    return value;
  } catch {
    return true;
  }
}

export async function isDndAccessGranted(): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    const { value } = await AdhanAlarmNative.isNotificationPolicyAccessGranted();
    return value;
  } catch {
    return true;
  }
}

export async function checkNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    const { granted } = await AdhanAlarmNative.checkNotificationPermission();
    return granted;
  } catch {
    return true;
  }
}

export interface PrayerPermissionsStatus {
  notifications: boolean;
  exactAlarms: boolean;
  batteryOptimizationIgnored: boolean;
  dndAccess: boolean;
  allGranted: boolean;
}

// استعلام مجمّع واحد بيرجع كل الصلاحيات الأربعة اللازمة عشان الأذان
// والتذكيرات يشتغلوا فعليًا حتى لو التطبيق مقفول تمامًا. لو حصل أي خطأ
// (بلجن قديم مثلًا)، بنرجّع الكل "ممنوح" بدل ما نقفل الصفحة بالغلط على
// نسخة تطبيق قديمة مش فيها الاستعلام الجديد.
export async function getPrayerPermissionsStatus(): Promise<PrayerPermissionsStatus> {
  if (!isNativeApp()) {
    return { notifications: true, exactAlarms: true, batteryOptimizationIgnored: true, dndAccess: true, allGranted: true };
  }
  try {
    const r = await AdhanAlarmNative.getPermissionsStatus();
    const allGranted = r.notifications && r.exactAlarms && r.batteryOptimizationIgnored && r.dndAccess;
    return { ...r, allGranted };
  } catch {
    return { notifications: true, exactAlarms: true, batteryOptimizationIgnored: true, dndAccess: true, allGranted: true };
  }
}
