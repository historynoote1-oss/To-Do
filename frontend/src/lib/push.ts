import { getVapidPublicKey, subscribePush, unsubscribePush } from './api';

export type PushSupportState = 'unsupported' | 'denied' | 'default' | 'subscribed' | 'unavailable';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// بيسجّل الـ Service Worker مرة واحدة بس (المتصفح بيتكفّل بالتحديثات
// تلقائيًا بعد كده)، وبيرجّع الـ registration عشان نستخدمه للاشتراك.
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

// بيرجّع الحالة الحالية من غير ما يطلب إذن (عشان نعرف نعرض الزرار المناسب
// في الواجهة من غير إزعاج المستخدم بطلب إذن هو معملوش حاجة يستحقه لسه).
export async function getPushState(): Promise<PushSupportState> {
  if (!isSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';

  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (reg) {
    const sub = await reg.pushManager.getSubscription();
    if (sub) return 'subscribed';
  }
  return 'default';
}

// بيطلب الإذن (لو محتاج) ويعمل اشتراك جديد ويبعته للسيرفر. بيترجع true لو
// نجح الاشتراك فعليًا.
export async function enablePush(): Promise<boolean> {
  if (!isSupported()) return false;

  const { publicKey, enabled } = await getVapidPublicKey();
  if (!enabled || !publicKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await ensureServiceWorker();
  if (!reg) return false;

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  await subscribePush({
    endpoint: json.endpoint!,
    keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
  });
  return true;
}

export async function disablePush(): Promise<void> {
  if (!isSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await unsubscribePush(endpoint).catch(() => {});
}
