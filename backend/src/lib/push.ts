import webpush from 'web-push';
import { prisma } from './prisma';

// مفاتيح VAPID بتثبت هوية السيرفر بتاعنا قدام متصفحات المستخدمين لما نبعتلهم
// إشعار Push، وهي لازم تتولّد مرة واحدة بس وتتحط في متغيرات البيئة (نفس
// المفتاحين على السيرفر والفرونت إند طول الوقت، تغييرهم بيبطّل كل الاشتراكات
// القديمة). ولّدهم محليًا بالأمر: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

const pushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (pushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  // مش هنوقف السيرفر عشان ده — باقي مميزات التذكيرات (داخل الموقع) تفضل شغالة
  // عادي، إشعارات الجهاز بس هي اللي هتتعطّل لحد ما المفاتيح تتضاف.
  console.warn('⚠️ VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY مش متظبطين — إشعارات الجهاز (Web Push) هتكون متعطّلة.');
}

export function isPushConfigured() {
  return pushConfigured;
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

// بيبعت إشعار Push لكل أجهزة مستخدم معيّن دفعة واحدة. لو اشتراك معيّن رجع
// خطأ 404/410 (يعني المستخدم شال الإذن أو مسح المتصفح)، بنحذفه من القاعدة
// تلقائيًا عشان منفضلش نحاول نبعتله على الفاضي كل مرة.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!pushConfigured) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error('تعذّر إرسال إشعار Push:', err?.message || err);
        }
      }
    })
  );
}
