// جدولة تذكيرات محلية أصلية (Local Notifications) على مستوى الجهاز،
// بالتوازي مع Web Push الموجود أصلاً — نفس المنطق المستخدم فعليًا لتذكير
// الأذان (AlarmScheduler.kt) لكن هنا عن طريق البلجن الرسمي
// @capacitor/local-notifications بدل كود Kotlin مخصص، لأن التذكيرات
// العادية (RemindersModal) محتاجة إشعار بسيط في وقت محدد بس، مش تشغيل
// صوت طويل جوه Foreground Service زي الأذان.
//
// الفايدة الأساسية: الإشعار ده متجدول على مستوى نظام أندرويد نفسه
// (AlarmManager من جوه البلجن) من لحظة إنشاء التذكير — يعني هيتصفّر
// ويطلع في معاده حتى لو التطبيق مقفول تمامًا أو التاب مقفول أو مفيش نت
// خالص وقت الاستحقاق، عكس Web Push اللي محتاج السيرفر يبعت والتطبيق
// يكون شغال أو الـ Service Worker يستقبل بنجاح (مش مضمون 100% مع Doze/
// Battery Optimization). البلجن بيعيد جدولة كل الإشعارات القائمة تلقائيًا
// بعد إعادة تشغيل الجهاز من غير ما نكتب كود إضافي (نفس فكرة
// AdhanBootReceiver بس مدمجة جوه البلجن نفسه).
//
// كل دالة هنا بترجع فورًا وبأمان لو التطبيق شغال في متصفح عادي (نفس مبدأ
// nativeShell.ts) — مفيش أي كسر لتجربة الويب أو لـ Web Push الحالي، ده
// طبقة إضافية مش بديلة.

import { Capacitor } from '@capacitor/core';
import type { Reminder } from './api';

const isNative = () => Capacitor.isNativePlatform();

const CHANNEL_ID = 'reminders';

// بنحوّل id التذكير (uuid نصي من السيرفر) لرقم صحيح 32-bit مستقر، لأن
// البلجن محتاج id رقمي للإشعار. نفس الـ id هيتحسب دايمًا لنفس التذكير،
// فنقدر نلغي الإشعار الصحيح وقت الحذف من غير ما نحتاج نخزّن خريطة إضافية.
function reminderNotificationId(reminderId: string): number {
  let hash = 0;
  for (let i = 0; i < reminderId.length; i++) {
    hash = (hash * 31 + reminderId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

// بننشئ قناة إشعارات مخصصة (لازمة من أندرويد 8+) بأولوية عالية عشان
// التذكير يظهر كإشعار كامل (heads-up) مع صوت واهتزاز، مش إشعار صامت في
// الخلفية. بتتنادى مرة واحدة بس من main.tsx عند الإقلاع.
export async function initReminderChannel() {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'تذكيرات المهام',
      description: 'إشعارات التذكيرات المجدولة لمهامك',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // البلجن مش متاح (مثلاً وقت التطوير جوه متصفح ديسكتوب) — تجاهل بأمان
  }
}

// بنطلب الإذن مرة واحدة بس لو لسه معلّق (default) — لو المستخدم رفض
// قبل كده مش هنزعجه تاني بطلب متكرر، وبنسيب Web Push شغال كبديل.
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

// بتتنادى فور إنشاء أي تذكير جديد (من RemindersModal أو من تذكيرات
// المهمة الجديدة في App.tsx) — بتجدول إشعار محلي أصلي بالتوازي مع تسجيل
// التذكير في السيرفر.
export async function scheduleLocalReminder(reminder: Reminder) {
  if (!isNative()) return;
  const fireAt = new Date(reminder.remindAt).getTime();
  if (!Number.isFinite(fireAt) || fireAt <= Date.now()) return; // وقته فات، مفيش داعي نجدوله

  const granted = await ensurePermission();
  if (!granted) return;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [
        {
          id: reminderNotificationId(reminder.id),
          title: 'تذكير',
          body: reminder.message?.trim() || 'عندك مهمة محتاجة انتباهك دلوقتي',
          channelId: CHANNEL_ID,
          schedule: { at: new Date(fireAt), allowWhileIdle: true },
        },
      ],
    });
  } catch {
    // تجاهل بأمان — Web Push لسه شغال كبديل
  }
}

// بتتنادى فور حذف تذكير — بتلغي الإشعار المحلي المطابق لنفس الـ id عشان
// ميظهرش بعد ما التذكير نفسه اتمسح من قائمة المستخدم.
export async function cancelLocalReminder(reminderId: string) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: reminderNotificationId(reminderId) }] });
  } catch {
    // تجاهل بأمان
  }
}
