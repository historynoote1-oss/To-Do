// جدولة تذكيرات الصلاة كإشعارات محلية أصلية على مستوى نظام أندرويد،
// بنفس أسلوب nativeReminders.ts بالظبط (البلجن الرسمي
// @capacitor/local-notifications) — الفرق إن ده مخصص لتذكيرات الصلاة
// (قبل كل أذان بعدد الدقايق اللي المستخدم يحددها)، ومجدول تلقائيًا لكل
// الصلوات الخمس مع كل تذكير مفعّل، مش مرتبط بعنصر واحد بعينه زي
// RemindersModal.
//
// أهم فرق عملي: التايمر العادي (window.setTimeout) في prayerTimesStore.tsx
// بيشتغل بس والتاب/التطبيق مفتوح. الإشعار المجدول هنا متسجّل على مستوى
// AlarmManager نفسه من لحظة الجدولة، فهيطلع في معاده حتى لو التطبيق
// مقفول تمامًا — وده بالظبط اللي طلبه المستخدم.

import { Capacitor } from '@capacitor/core';
import { DayTimings, PrayerKey, PRAYER_ORDER, PRAYER_LABELS } from '@/lib/prayer/prayerTimes';

const isNative = () => Capacitor.isNativePlatform();

const CHANNEL_ID = 'prayer_reminders';
const SCHEDULED_IDS_KEY = 'prayerTimes.nativeReminderIds.v1';

// نفس أسلوب hash مستقر 32-بت المستخدم في nativeReminders.ts، لكن بمدخل
// مختلف (مفتاح الصلاة + عدد الدقايق + الطابع الزمني) عشان كل تذكير فعلي
// (صلاة × دقائق × يوم) ياخد id ثابت ومميّز خاص بيه.
function hashToId(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function loadStoredIds(): number[] {
  try {
    const raw = localStorage.getItem(SCHEDULED_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function saveStoredIds(ids: number[]) {
  try {
    localStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(ids));
  } catch {
    // تخزين محلي مش متاح — نتجاهل بهدوء
  }
}

export async function initPrayerReminderChannel() {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'تذكيرات الصلاة',
      description: 'إشعارات التذكير قبل كل صلاة بالوقت اللي تحدده',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // تجاهل بأمان — نفس مبدأ باقي الجسور الـ Native هنا
  }
}

let permissionRequestedThisSession = false;
async function ensurePermission(): Promise<boolean> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    if (current.display === 'denied' && permissionRequestedThisSession) return false;
    permissionRequestedThisSession = true;
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * بتلغي كل تذكيرات الصلاة المجدولة سابقًا (المخزّنة محليًا) وتجدول
 * مجموعة جديدة بناءً على مواقيت اليوم الحالي + قائمة عدد الدقايق
 * المفعّلة، وتنطبق كل قيمة على الصلوات الخمس كلها. بتتنادى في كل مرة
 * المواقيت أو قائمة التذكيرات تتغيّر (زي scheduleNativeAdhanForDay
 * بالظبط للأذان نفسه).
 */
export async function scheduleAllNativePrayerReminders(timings: DayTimings, offsetsMinutes: number[]): Promise<void> {
  if (!isNative()) return;

  // إلغاء أي تذكيرات قديمة أولًا (سواء من نفس الجلسة أو من جلسة سابقة
  // قبل ما التطبيق يتقفل) عشان مايتكررش نفس التذكير بمعادين مختلفين.
  const previousIds = loadStoredIds();
  if (previousIds.length) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: previousIds.map((id) => ({ id })) });
    } catch {
      // تجاهل
    }
  }

  if (!offsetsMinutes.length) {
    saveStoredIds([]);
    return;
  }

  const granted = await ensurePermission();
  if (!granted) {
    saveStoredIds([]);
    return;
  }

  const now = Date.now();
  const newIds: number[] = [];
  const notifications: {
    id: number;
    title: string;
    body: string;
    channelId: string;
    schedule: { at: Date; allowWhileIdle: boolean };
  }[] = [];

  PRAYER_ORDER.forEach((key: PrayerKey) => {
    const prayerTime = timings.times[key].getTime();
    offsetsMinutes.forEach((minutes) => {
      const fireAt = prayerTime - minutes * 60_000;
      if (fireAt <= now) return; // وقته فات، مفيش داعي نجدوله
      const id = hashToId(`prayer-reminder:${key}:${minutes}:${prayerTime}`);
      newIds.push(id);
      notifications.push({
        id,
        title: `باقي ${minutes} دقيقة على أذان ${PRAYER_LABELS[key]}`,
        body: 'استعد لصلاتك 🤍',
        channelId: CHANNEL_ID,
        schedule: { at: new Date(fireAt), allowWhileIdle: true },
      });
    });
  });

  if (!notifications.length) {
    saveStoredIds([]);
    return;
  }

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({ notifications });
    saveStoredIds(newIds);
  } catch {
    saveStoredIds([]);
  }
}

export async function cancelAllNativePrayerReminders(): Promise<void> {
  if (!isNative()) return;
  const ids = loadStoredIds();
  if (!ids.length) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    // تجاهل
  } finally {
    saveStoredIds([]);
  }
}
