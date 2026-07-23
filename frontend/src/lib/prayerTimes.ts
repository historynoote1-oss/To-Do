// منطق مواقيت الصلاة — كل الحسابات والاتصال بالـ API هنا (بعيد عن أي
// state أو JSX)، بنفس فكرة lib/routes.ts و lib/recurrence.ts: منطق خالص
// سهل القراءة والاختبار لوحده.
//
// المصدر: Aladhan API (aladhan.com) — بياخد إحداثيات دقيقة (خط طول/عرض)
// وتاريخ، ويرجّع مواقيت الصلاة محسوبة فعليًا لنفس اليوم في المنطقة الزمنية
// المحلية للموقع ده (مبني على قاعدة بيانات المناطق الزمنية IANA)، يعني
// التوقيت الصيفي/الشتوي بيتراعى تلقائيًا لأنه جزء من حساب المنطقة الزمنية
// نفسها — مفيش أي منطق يدوي لازم نعمله إحنا عشان كده. وبما إننا بنجيب
// المواقيت *كل يوم من جديد* بإحداثيات المستخدم الفعلية، أي فرق في مواقيت
// الصلاة بين يوم وتاني (بيختلف عادة بضع دقايق) بيتراعى تلقائيًا برضه.

export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type TimingKey = PrayerKey | 'sunrise' | 'imsak' | 'midnight';

export const PRAYER_ORDER: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

export const PRAYER_ICONS: Record<PrayerKey, string> = {
  fajr: 'sunrise',
  dhuhr: 'sun',
  asr: 'sun',
  maghrib: 'moon-star',
  isha: 'moon',
};

// أهم طرق الحساب الفلكي المتاحة في الـ API — كل واحدة بتفرق شوية في زاوية
// الشفق المستخدمة لحساب الفجر والعشاء، فبتختلف الأوقات دقايق بسيطة حسب
// الطريقة المتّبعة في منطقتك. بنسيب الاختيار للمستخدم بدل ما نفرض واحدة،
// مع افتراضي منطقي (رابطة العالم الإسلامي) لو محددش حاجة.
export const CALCULATION_METHODS: { id: number; name: string }[] = [
  { id: 3, name: 'رابطة العالم الإسلامي' },
  { id: 5, name: 'الهيئة المصرية العامة للمساحة' },
  { id: 4, name: 'أم القرى — مكة المكرمة' },
  { id: 2, name: 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)' },
  { id: 1, name: 'جامعة العلوم الإسلامية — كراتشي' },
  { id: 8, name: 'منطقة الخليج' },
  { id: 9, name: 'الكويت' },
  { id: 10, name: 'قطر' },
  { id: 11, name: 'سنغافورة' },
  { id: 13, name: 'ديانت — تركيا' },
  { id: 7, name: 'طهران' },
  { id: 0, name: 'جعفري — الشيعة الإثنا عشرية' },
];

export type Madhab = 'shafi' | 'hanafi';

export interface PrayerLocation {
  lat: number;
  lng: number;
  label: string;
  source: 'gps' | 'manual';
  accuracy?: number | null;
}

export interface DayTimings {
  dateKey: string; // YYYY-MM-DD بتاريخ الموقع نفسه
  timezone: string;
  hijri: string;
  gregorian: string;
  times: Record<TimingKey, Date>;
}

export class GeolocationDeniedError extends Error {}
export class GeolocationUnavailableError extends Error {}

// بيطلب موقع المستخدم الجغرافي بأعلى دقة ممكنة. لو التطبيق شغال كـ APK
// حقيقي (Capacitor) بنستخدم بلجن @capacitor/geolocation الأصلي، لأنه هو
// الوحيد اللي بيقدر يفتح نافذة إذن الموقع الحقيقية بتاعة أندرويد جوه
// الـ WebView ويتأكد إن الإذن متسجل في النظام؛ navigator.geolocation
// العادي جوه WebView بيفشل بصمت أو بيديله رسالة "فعّله من المتصفح" اللي
// مالهاش معنى في تطبيق مثبّت. على الويب العادي (المتصفح) بنستخدم
// navigator.geolocation زي ما هو، ومفيش طريقة تانية أدق منه متاحة هناك.
export async function requestGeolocation(): Promise<{ lat: number; lng: number; accuracy: number | null }> {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    return requestNativeGeolocation();
  }
  return requestBrowserGeolocation();
}

async function requestNativeGeolocation(): Promise<{ lat: number; lng: number; accuracy: number | null }> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    let status = await Geolocation.checkPermissions();
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      status = await Geolocation.requestPermissions();
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      throw new GeolocationDeniedError('إذن الموقع الجغرافي متمنوع — لازم تفعّله من إعدادات التطبيق في هاتفك (الإعدادات ← التطبيقات ← خريطة ← الأذونات ← الموقع)');
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
  } catch (err) {
    if (err instanceof GeolocationDeniedError) throw err;
    throw new GeolocationUnavailableError('تعذّر تحديد موقعك الجغرافي حاليًا — تأكد إن خدمة الموقع (GPS) مفعّلة في الهاتف');
  }
}

function requestBrowserGeolocation(): Promise<{ lat: number; lng: number; accuracy: number | null }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeolocationUnavailableError('المتصفح ده مش بيدعم تحديد الموقع الجغرافي'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new GeolocationDeniedError('إذن الموقع الجغرافي متمنوع — لازم تفعّله من إعدادات المتصفح'));
        } else {
          reject(new GeolocationUnavailableError('تعذّر تحديد موقعك الجغرافي حاليًا'));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// بيرجّع اسم المكان (مدينة/دولة) من الإحداثيات — تجميلي بس (لعرض "أنت في
// القاهرة، مصر" مثلًا)، فلو فشل مش لازم يعطّل حساب المواقيت نفسه.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=ar`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const city = data.city || data.locality || data.principalSubdivision;
    const country = data.countryName;
    if (city && country) return `${city}، ${country}`;
    return country || city || null;
  } catch {
    return null;
  }
}

function dateKeyFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// الـ API بيرجّع الوقت كنص "05:12" (وأحيانًا بلاحقة منطقة زمنية زي "(EEST)")
// مع تاريخ اليوم المطلوب — بندمجهم في Date كامل بدل التعامل مع نص وقت مجرّد،
// عشان نقدر نحسب الفرق الزمني والعدّ التنازلي بسهولة.
function parseTimeOnDate(timeStr: string, baseDate: Date): Date {
  const clean = timeStr.split(' ')[0];
  const [h, m] = clean.split(':').map((n) => parseInt(n, 10));
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

// بيجيب مواقيت يوم واحد لموقع معيّن — ده الأساس اللي كل حاجة تانية مبنية
// عليه (العدّ التنازلي، الجدولة التلقائية للأذان، عرض الصفحة).
export async function fetchDayTimings(
  location: { lat: number; lng: number },
  date: Date,
  method: number,
  madhab: Madhab
): Promise<DayTimings> {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const dateParam = `${dd}-${mm}-${yyyy}`;
  const school = madhab === 'hanafi' ? 1 : 0;
  const url = `https://api.aladhan.com/v1/timings/${dateParam}?latitude=${location.lat}&longitude=${location.lng}&method=${method}&school=${school}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('تعذّر جلب مواقيت الصلاة من الخدمة — جرّب تاني بعد شوية');
  const json = await res.json();
  const t = json?.data?.timings;
  if (!t) throw new Error('رد غير متوقع من خدمة مواقيت الصلاة');

  // المواقيت اللي بترجع من الـ API محسوبة أصلًا بتوقيت المنطقة المحلية
  // لإحداثياتك (بما فيها فرق التوقيت الصيفي/الشتوي لو مفعّل حاليًا في
  // بلدك) — فبنستخدم تاريخ اليوم المطلوب زي ما هو من غير أي تحويل إضافي.
  const times: Record<TimingKey, Date> = {
    imsak: parseTimeOnDate(t.Imsak, date),
    fajr: parseTimeOnDate(t.Fajr, date),
    sunrise: parseTimeOnDate(t.Sunrise, date),
    dhuhr: parseTimeOnDate(t.Dhuhr, date),
    asr: parseTimeOnDate(t.Asr, date),
    maghrib: parseTimeOnDate(t.Maghrib, date),
    isha: parseTimeOnDate(t.Isha, date),
    midnight: parseTimeOnDate(t.Midnight, date),
  };

  const hijri = json?.data?.date?.hijri;
  const hijriLabel = hijri ? `${hijri.day} ${hijri.month?.ar || hijri.month?.en} ${hijri.year}هـ` : '';
  const gregorian = json?.data?.date?.readable || '';

  return {
    dateKey: dateKeyFor(date),
    timezone: json?.data?.meta?.timezone || '',
    hijri: hijriLabel,
    gregorian,
    times,
  };
}

export interface NextPrayerInfo {
  key: PrayerKey;
  time: Date;
  remainingMs: number;
}

// بيحدّد الصلاة الجاية من مواقيت اليوم (أو بكرة لو كل صلوات النهارده فاتت،
// المستدعي مسؤول عن تمرير مواقيت الغد في الحالة دي لو متاحة).
export function findNextPrayer(todayTimes: Record<TimingKey, Date>, now: Date): NextPrayerInfo | null {
  for (const key of PRAYER_ORDER) {
    const time = todayTimes[key];
    if (time.getTime() > now.getTime()) {
      return { key, time, remainingMs: time.getTime() - now.getTime() };
    }
  }
  return null;
}

// بيحدّد الصلاة "الحالية" (اللي دخل وقتها ولسه ما جاش وقت اللي بعدها) —
// مفيدة لتمييز البطاقة النشطة في الشبكة.
export function findCurrentPrayer(todayTimes: Record<TimingKey, Date>, now: Date): PrayerKey | null {
  let current: PrayerKey | null = null;
  for (const key of PRAYER_ORDER) {
    if (todayTimes[key].getTime() <= now.getTime()) {
      current = key;
    }
  }
  return current;
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatClock(date: Date, is24h: boolean): string {
  return date.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !is24h,
  });
}
