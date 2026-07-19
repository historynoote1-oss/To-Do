import { getVapidPublicKey, subscribePush, unsubscribePush } from './api';

export type PushSupportState = 'unsupported' | 'denied' | 'default' | 'subscribed' | 'unavailable';

// كل خطأ ليه سبب مختلف تمامًا وحل مختلف، فبنميّزهم بنوع مخصوص بدل ما
// نرجع true/false بس. ده اللي بيخلي الواجهة تقدر تعرض رسالة دقيقة للمستخدم
// بدل رسالة عامة ملهاش معنى، وبيخلي المشكلة قابلة للتشخيص من الـ console.
export type PushErrorCode =
  | 'not_supported'
  | 'server_not_configured'
  | 'permission_denied'
  | 'service_worker_failed'
  | 'subscription_failed'
  | 'network_error';

export class PushError extends Error {
  code: PushErrorCode;
  constructor(code: PushErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'PushError';
    this.code = code;
    if (cause !== undefined) {
      // بنسجل السبب الأصلي في الـ console دايمًا عشان نقدر نشخّص أي حاجة
      // غير متوقعة حتى لو مبعتناش الرسالة دي للمستخدم كاملة.
      console.error(`[push] ${code}:`, cause);
    }
  }
}

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

// بيطلب الإذن (لو محتاج) ويعمل اشتراك جديد ويبعته للسيرفر.
// بيرمي PushError برمز مختلف لكل سبب فشل بدل ما يرجع true/false بس،
// عشان الواجهة تقدر تعرض رسالة دقيقة ومفيدة للمستخدم (ومحتاجين نعرف
// السبب الحقيقي بدل رسالة عامة زي "تعذّر تفعيل الإشعارات").
export async function enablePush(): Promise<void> {
  if (!isSupported()) {
    throw new PushError('not_supported', 'الجهاز أو المتصفح ده مش بيدعم إشعارات الجهاز');
  }

  // 1) هل السيرفر أصلًا مظبّط عليه مفاتيح VAPID؟ لو ناقصة، مفيش أي فايدة
  // من طلب إذن الإشعارات من المستخدم أصلًا.
  let publicKey: string;
  let enabled: boolean;
  try {
    const res = await getVapidPublicKey();
    publicKey = res.publicKey;
    enabled = res.enabled;
  } catch (err) {
    throw new PushError(
      'network_error',
      'مقدرناش نتواصل مع السيرفر عشان نفعّل الإشعارات — جرّب تاني كمان شوية',
      err
    );
  }
  if (!enabled || !publicKey) {
    throw new PushError(
      'server_not_configured',
      'إشعارات الجهاز مش متفعّلة على السيرفر لسه — لازم مفاتيح VAPID تتضاف في إعدادات البيئة',
      { enabled, hasPublicKey: Boolean(publicKey) }
    );
  }

  // 2) إذن المتصفح
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (err) {
    throw new PushError('permission_denied', 'مقدرناش نطلب إذن الإشعارات من المتصفح', err);
  }
  if (permission !== 'granted') {
    throw new PushError('permission_denied', 'إذن الإشعارات اتمنع من المتصفح');
  }

  // 3) تسجيل الـ Service Worker
  const reg = await ensureServiceWorker();
  if (!reg) {
    throw new PushError(
      'service_worker_failed',
      'مقدرناش نسجّل الـ Service Worker — لازم الموقع يشتغل على HTTPS (أو localhost)'
    );
  }

  // 4) الاشتراك في Push Manager وبعته للسيرفر
  try {
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error('subscription object missing endpoint/keys');
    }

    await subscribePush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch (err) {
    throw new PushError('subscription_failed', 'الاشتراك في إشعارات الجهاز فشل', err);
  }
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
