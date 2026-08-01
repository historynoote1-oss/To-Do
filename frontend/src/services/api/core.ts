// ===== البنية التحتية المشتركة لكل موديولات الـ API =====
// كل ملف تحت services/api/* بيستورد من هنا: عنوان السيرفر، الهيدرز
// المُوثّقة، إعادة المحاولة، ومعالج الاستجابة الموحّد. أي منطق مشترك بين
// أكتر من دومين (auth, lists, items...) مكانه هنا وبس.

export const API_URL = import.meta.env.VITE_API_URL as string;

export function getToken() {
  return localStorage.getItem('token');
}

export function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

// من غير Content-Type عن قصد: لما بنبعت FormData (رفع صورة الأفتار)، لازم
// المتصفح هو اللي يحدد الـ Content-Type بنفسه (multipart/form-data مع
// boundary)، فلو ثبّتناه يدوي هنا هيبوّظ الطلب.
export function authHeadersNoContentType() {
  return {
    Authorization: `Bearer ${getToken()}`,
  };
}

// خطأ مخصوص لوضع الصيانة عشان الواجهة تقدر تفرّق بينه وبين أي خطأ عادي
// وتحوّل المستخدم لصفحة الصيانة فورًا بدل ما تعرضله toast عادي بس.
export class MaintenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaintenanceError';
  }
}

// بيرجّع تاريخ اليوم الحالي بتوقيت الجهاز نفسه (مش UTC) كنص "YYYY-MM-DD".
// السيرفر (لوحده) مش عارف يحدد "دلوقتي إيه اليوم" بالنسبة للمستخدم لأنه
// بيشتغل بتوقيت UTC، فأي مستخدم بتوقيت متقدّم عن UTC (زي توقيت القاهرة)
// وبيخلّص مهامه بعد نص الليل المحلي بس قبل نص الليل UTC كان بيتسجّل إنجازه
// على يوم غلط ويكسر السلسلة (الاستريك). بنبعت التاريخ المحلي ده صراحةً مع
// كل طلب بيأثر على الاستريك (تأكيد إنجاز، وجلب السلسلة) عشان السيرفر يعتمد
// على يوم المستخدم الفعلي مش يومه هو.
export function localDateKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// خطأ مخصوص لانتهاء/بطلان الجلسة (توكن منتهي، حساب اتعمله force-logout،
// كلمة السر اتغيّرت من جهاز تاني...) عشان الواجهة تقدر تفرّق بينه وبين أي
// خطأ عادي وترجّع المستخدم لصفحة تسجيل الدخول فورًا بدل ما تسيبه واقف
// قدام شاشة معطوبة بتكرر له رسائل خطأ "401" مبهمة على كل حركة.
export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

// بنمنع إطلاق أكتر من إشعار "الجلسة انتهت" مرة واحدة لو أكتر من طلب اتنفذ
// في نفس اللحظة وكلهم رجعوا 401 (زي refresh() وrefreshArchiveCount() اللي
// بيتنفذوا مع بعض) — من غير الحارس ده هيظهر toast مكرر لكل طلب فشل.
let sessionExpiredNotified = false;

// بتتنادى لما المستخدم يسجّل دخول تاني بنجاح، عشان لو الجلسة الجديدة كمان
// انتهت لاحقًا نقدر نطلق الإشعار تاني بدل ما يفضل الحارس مقفول للأبد.
export function resetSessionExpiredGuard() {
  sessionExpiredNotified = false;
}

export function notifySessionExpired() {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
}

// authed=true (الافتراضي) للطلبات اللي بتبعت توكن (Authorization header) —
// أي 401 منها معناه الجلسة بطلت. authed=false للطلبات العامة زي تسجيل
// الدخول/إنشاء حساب، لأن 401/400 منها معناه بيانات غلط بس، مش جلسة منتهية.
// إعادة المحاولة التلقائية لانقطاع الشبكة المؤقت (المرحلة 6). بنطبّقها
// بس على طلبات القراءة (GET) الأساسية اللي بتتحمل عند فتح/تحديث الشاشة
// الرئيسية — مقصود عمدًا إننا مش بنطبّقها على طلبات الكتابة (إنشاء/تعديل/
// حذف) عشان مانكررش إجراء ممكن يكون نفّذ فعليًا على السيرفر رغم إن
// الاستجابة ضاعت. `fetch` نفسه (مش استجابة الخادم) هو اللي بيرمي
// TypeError لما مفيش اتصال بالشبكة خالص — ده الحالة الوحيدة اللي بنعيد
// المحاولة فيها، مش أي خطأ تاني (401/404/500... إلخ بترجع استجابة عادية
// ومفروض تتعامل معاها `handle` زي ما هي).
const RETRY_DELAYS_MS = [500, 1500, 3500];

export async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastErr;
}

export async function handle(res: Response, authed: boolean = true) {
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    if (res.status === 503 && errorBody.maintenance) {
      throw new MaintenanceError(errorBody.error || 'الموقع تحت الصيانة حاليًا');
    }
    if (res.status === 401 && authed) {
      notifySessionExpired();
      throw new SessionExpiredError(errorBody.error || 'انتهت صلاحية جلستك');
    }
    throw new Error(errorBody.error || `خطأ (${res.status})`);
  }
  return res.json();
}
