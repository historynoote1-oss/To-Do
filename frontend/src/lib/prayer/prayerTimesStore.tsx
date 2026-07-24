// حالة "مواقيت الصلاة" مركزية (Context) — بنفس فكرة MusicPlayerProvider
// بالظبط وللسبب نفسه: الأذان لازم يشتغل تلقائيًا في معاده الصحيح مهما
// كانت الصفحة اللي المستخدم فاتحها دلوقتي (مش بس وهو واقف في صفحة مواقيت
// الصلاة نفسها)، فمينفعش المنطق ده يعيش جوه مكوّن الصفحة اللي بيتقفل
// (unmount) لما يتنقّل لمكان تاني. هنا بدل كده بنركّبه مرة واحدة في أعلى
// شجرة التطبيق (main.tsx) وبيفضل شغّال في الخلفية طول الوقت.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import {
  PrayerKey,
  TimingKey,
  Madhab,
  PrayerLocation,
  DayTimings,
  PRAYER_ORDER,
  PRAYER_LABELS,
  fetchDayTimings,
  findNextPrayer,
  findCurrentPrayer,
  requestGeolocation,
  reverseGeocode,
  GeolocationDeniedError,
} from '@/lib/prayer/prayerTimes';
import { BUILT_IN_RECITERS, SILENT_RECITER_ID, getCustomAdhanBlob, CustomAdhanMeta, listCustomAdhans } from '@/lib/audio/adhanAudio';
import { useMusicPlayer } from '@/lib/audio/musicPlayer';
import { toast } from '@/lib/core/toast';
import { sounds } from '@/lib/audio/sounds';
import { scheduleNativeAdhanForDay, ensureNativeAdhanPermissions, isNativeApp } from '@/lib/audio/nativeAdhan';
import { initPrayerReminderChannel, scheduleAllNativePrayerReminders } from '@/lib/prayer/prayerNativeReminders';

export interface PrayerTimesSettings {
  method: number;
  madhab: Madhab;
  reciterSelection: string; // معرّف قارئ جاهز، أو id ملف مرفوع، أو 'silent'
  autoPlayEnabled: boolean;
  volume: number; // 0-100
  is24h: boolean;
  browserNotify: boolean;
  // قائمة مفتوحة (بدون حد أقصى) لعدد الدقايق قبل كل أذان — كل قيمة هنا
  // بتتطبق تلقائيًا على الصلوات الخمس كلها، فمفيش داعي لاختيار منفصل لكل
  // صلاة. مثال: [10, 20] يعني تذكيرين قبل كل صلاة (بعشر دقايق وبعشرين).
  reminders: number[];
}

const DEFAULT_SETTINGS: PrayerTimesSettings = {
  method: 3,
  madhab: 'shafi',
  reciterSelection: BUILT_IN_RECITERS[0].id,
  autoPlayEnabled: true,
  volume: 85,
  is24h: false,
  browserNotify: false,
  reminders: [10],
};

const SETTINGS_KEY = 'prayerTimes.settings.v1';
const LOCATION_KEY = 'prayerTimes.location.v1';

// لو المستخدم عنده إعدادات محفوظة من الشكل القديم (تذكير منفصل لكل صلاة
// بـ enabled/minutesBefore)، بنحوّلها تلقائيًا لقائمة موحّدة بدل ما نضيّع
// اختياره: بناخد كل قيم minutesBefore اللي كانت مفعّلة، من غير تكرار.
function migrateLegacyReminders(raw: unknown): number[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const values = new Set<number>();
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object' && 'enabled' in v && 'minutesBefore' in v) {
      const setting = v as { enabled: boolean; minutesBefore: number };
      if (setting.enabled && Number.isFinite(setting.minutesBefore)) {
        values.add(setting.minutesBefore);
      }
    }
  }
  return values.size ? Array.from(values).sort((a, b) => a - b) : [];
}

function loadSettings(): PrayerTimesSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const legacy = migrateLegacyReminders(parsed.reminders);
    const reminders = Array.isArray(parsed.reminders)
      ? (parsed.reminders as unknown[]).filter((n): n is number => typeof n === 'number' && n > 0)
      : legacy !== null
        ? legacy
        : DEFAULT_SETTINGS.reminders;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      reminders,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: PrayerTimesSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // تخزين محلي مش متاح — نتجاهل بهدوء زي باقي مكتبات الموقع
  }
}

function loadLocation(): PrayerLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat !== 'number' || typeof parsed?.lng !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLocation(loc: PrayerLocation | null) {
  try {
    if (loc) localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
    else localStorage.removeItem(LOCATION_KEY);
  } catch {
    // نفس التسامح المعتاد
  }
}

interface PrayerTimesContextValue {
  location: PrayerLocation | null;
  locating: boolean;
  loadingTimes: boolean;
  error: string | null;
  today: DayTimings | null;
  now: Date;
  nextPrayer: { key: PrayerKey; time: Date; remainingMs: number } | null;
  currentPrayer: PrayerKey | null;
  settings: PrayerTimesSettings;
  customAdhans: CustomAdhanMeta[];
  isAzanPlaying: boolean;
  azanPlayingLabel: string | null;
  detectLocation: () => Promise<void>;
  updateSettings: (patch: Partial<PrayerTimesSettings>) => void;
  addReminder: (minutesBefore: number) => void;
  removeReminder: (minutesBefore: number) => void;
  refreshCustomAdhans: () => Promise<void>;
  previewReciter: (selection: string) => Promise<void>;
  stopAzan: () => void;
  testAzanNow: () => Promise<void>;
  refresh: () => Promise<void>;
}

const PrayerTimesContext = createContext<PrayerTimesContextValue | null>(null);

async function resolveAudioUrl(selection: string, customCacheRef: React.MutableRefObject<Map<string, string>>): Promise<string | null> {
  if (selection === SILENT_RECITER_ID) return null;
  const builtIn = BUILT_IN_RECITERS.find((r) => r.id === selection);
  if (builtIn) return builtIn.url;
  const cached = customCacheRef.current.get(selection);
  if (cached) return cached;
  const blob = await getCustomAdhanBlob(selection);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  customCacheRef.current.set(selection, url);
  return url;
}

export function PrayerTimesProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<PrayerLocation | null>(() => loadLocation());
  const [locating, setLocating] = useState(false);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<DayTimings | null>(null);
  const [now, setNow] = useState(new Date());
  const [settings, setSettings] = useState<PrayerTimesSettings>(() => loadSettings());
  const [customAdhans, setCustomAdhans] = useState<CustomAdhanMeta[]>([]);
  const [isAzanPlaying, setIsAzanPlaying] = useState(false);
  const [azanPlayingLabel, setAzanPlayingLabel] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const customUrlCacheRef = useRef<Map<string, string>>(new Map());
  const scheduledTimeoutsRef = useRef<number[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const todayRef = useRef(today);
  todayRef.current = today;

  const musicPlayer = useMusicPlayer();
  const musicPlayerRef = useRef(musicPlayer);
  musicPlayerRef.current = musicPlayer;

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audioRef.current = audio;
    }
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    listCustomAdhans().then(setCustomAdhans);
  }, []);

  // لو التطبيق شغال كـ APK حقيقي، نتأكد بدري إن صلاحية "الإنذارات
  // الدقيقة" مفعّلة (Android 12+)، لأن من غيرها الأذان ممكن يتأخر
  // شوية بدل ما يدق في معاده بالظبط.
  useEffect(() => {
    if (isNativeApp()) {
      ensureNativeAdhanPermissions();
      initPrayerReminderChannel();
    }
  }, []);

  // ساعة حية للعدّ التنازلي وتحديد الصلاة الحالية/الجاية — بتتحدّث كل ثانية.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const clearScheduled = useCallback(() => {
    scheduledTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    scheduledTimeoutsRef.current = [];
  }, []);

  const stopAzan = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsAzanPlaying(false);
    setAzanPlayingLabel(null);
  }, []);

  const playAzanFor = useCallback(async (prayer: PrayerKey | null, label: string) => {
    const sel = settingsRef.current.reciterSelection;
    const url = await resolveAudioUrl(sel, customUrlCacheRef);
    // مقاطعة القرآن لو شغّال حاليًا — الأذان أهم في وقته.
    musicPlayerRef.current.pauseForInterruption();
    if (settingsRef.current.browserNotify && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(prayer ? `حان الآن موعد صلاة ${PRAYER_LABELS[prayer]}` : 'الأذان', { body: label });
      } catch {
        // إشعارات المتصفح مش أساسية لعمل الأذان نفسه
      }
    }
    if (!url) {
      // اختيار "بدون صوت" — تنبيه صامت بس (توست + اهتزاز لو الجهاز بيدعمه)
      toast.reminder(label);
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate([300, 120, 300, 120, 300]);
        } catch {
          // بعض المتصفحات بترفض الاهتزاز بدون تفاعل مباشر — نتجاهل بهدوء
        }
      }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = url;
    audio.volume = Math.min(1, Math.max(0, settingsRef.current.volume / 100));
    audio.currentTime = 0;
    setAzanPlayingLabel(label);
    audio.onended = () => {
      setIsAzanPlaying(false);
      setAzanPlayingLabel(null);
    };
    try {
      await audio.play();
      setIsAzanPlaying(true);
      toast.reminder(label);
    } catch {
      // المتصفح ممكن يمنع تشغيل صوت تلقائي من غير تفاعل سابق من المستخدم
      // في الجلسة دي — بنعرض تنبيه نصي على الأقل عشان المستخدم ميفوتش الصلاة.
      setIsAzanPlaying(false);
      toast.reminder(`${label} — دوس أي حتة في الصفحة عشان يشتغل صوت الأذان تلقائيًا في المرة الجاية`);
    }
  }, []);

  // الخدمة الـ Native (AlarmManager) بتشغّل الصوت حتى لو التطبيق مقفول
  // تمامًا، لكنها مش عندها وصول لملفات مرفوعة محليًا (IndexedDB) زي
  // JS، فبنحولها لرابط https قابل للستريمنج: رابط القارئ الجاهز لو
  // مختار، أو "silent" لو المستخدم مسكّت الأذان، أو أول قارئ جاهز
  // كبديل لو مختار ملف مرفوع بنفسه (أفضل من الصمت في منبّه أساسه إنه
  // "يشتغل مهما حصل").
  const resolveNativeSoundResource = useCallback((selection: string): string => {
    if (selection === SILENT_RECITER_ID) return 'silent';
    const builtIn = BUILT_IN_RECITERS.find((r) => r.id === selection);
    if (builtIn) return builtIn.url;
    return BUILT_IN_RECITERS[0].url;
  }, []);

  // بيجدول تشغيل الأذان التلقائي + التذكيرات لباقي صلوات النهارده، وبيجدول
  // كمان إعادة الجلب عند منتصف الليل المحلي عشان مواقيت الغد تتحمّل من
  // غير ما المستخدم يحتاج يعمل أي حاجة بنفسه.
  const scheduleForDay = useCallback(
    (timings: DayTimings) => {
      clearScheduled();
      const referenceNow = Date.now();

      // جدولة Native موازية للتايمر العادي في JS: التايمر بيشتغل بس
      // والصفحة مفتوحة، أما دي فبتضمن التشغيل حتى لو التطبيق مقفول
      // خالص. بنسيبهم الاتنين شغالين مع بعض؛ لو الاتنين اشتغلوا في نفس
      // اللحظة (نادر جدًا) هيتشغل صوت مرتين، تفضيل مقبول جدًا مقابل
      // ضمان إن الأذان ميتفوتش خالص.
      if (isNativeApp()) {
        scheduleNativeAdhanForDay(
          timings,
          resolveNativeSoundResource(settingsRef.current.reciterSelection),
          settingsRef.current.autoPlayEnabled
        );
      }

      PRAYER_ORDER.forEach((key) => {
        const time = timings.times[key];
        const delay = time.getTime() - referenceNow;
        if (delay > 0 && settingsRef.current.autoPlayEnabled) {
          const id = window.setTimeout(() => {
            playAzanFor(key, `حان الآن موعد صلاة ${PRAYER_LABELS[key]}`);
          }, delay);
          scheduledTimeoutsRef.current.push(id);
        }

        // كل قيمة في settings.reminders بتتطبق على الصلاة دي (وعلى كل
        // الصلوات الباقية بنفس الطريقة) — تذكير منفصل لكل قيمة.
        settingsRef.current.reminders.forEach((minutesBefore) => {
          const reminderDelay = delay - minutesBefore * 60_000;
          if (reminderDelay > 0) {
            const id = window.setTimeout(() => {
              sounds.reminder();
              toast.reminder(`باقي ${minutesBefore} دقيقة على أذان ${PRAYER_LABELS[key]}`);
              if (settingsRef.current.browserNotify && 'Notification' in window && Notification.permission === 'granted') {
                try {
                  new Notification(`باقي ${minutesBefore} دقيقة على أذان ${PRAYER_LABELS[key]}`);
                } catch {
                  // تجميلي بس
                }
              }
            }, reminderDelay);
            scheduledTimeoutsRef.current.push(id);
          }
        });
      });

      // جدولة Native للتذكيرات (إشعار نظامي حقيقي) بالتوازي مع التايمرات
      // اللي فوق — دي الضمانة إن التذكير يوصل حتى لو التطبيق مقفول تمامًا،
      // بنفس فكرة scheduleNativeAdhanForDay للأذان نفسه بالظبط.
      if (isNativeApp()) {
        scheduleAllNativePrayerReminders(timings, settingsRef.current.reminders);
      }

      // منتصف الليل الجاي بتوقيت الجهاز المحلي — وقت مناسب لإعادة الجلب
      // لأن كل صلوات النهارده تكون خلصت أكيد قبل كده.
      const midnight = new Date();
      midnight.setDate(midnight.getDate() + 1);
      midnight.setHours(0, 0, 5, 0);
      const midnightDelay = midnight.getTime() - referenceNow;
      const id = window.setTimeout(() => {
        refreshRef.current?.();
      }, midnightDelay);
      scheduledTimeoutsRef.current.push(id);
    },
    [clearScheduled, playAzanFor]
  );

  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  const fetchAndSchedule = useCallback(
    async (loc: PrayerLocation) => {
      setLoadingTimes(true);
      setError(null);
      try {
        const timings = await fetchDayTimings({ lat: loc.lat, lng: loc.lng }, new Date(), settingsRef.current.method, settingsRef.current.madhab);
        setToday(timings);
        scheduleForDay(timings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذّر جلب مواقيت الصلاة');
      } finally {
        setLoadingTimes(false);
      }
    },
    [scheduleForDay]
  );

  const refresh = useCallback(async () => {
    if (!location) return;
    await fetchAndSchedule(location);
  }, [location, fetchAndSchedule]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // أول ما يكون عندنا موقع محفوظ (من زيارة سابقة أو من دوس زرار "تحديد
  // موقعي")، بنجيب مواقيت النهارده ونجدول كل حاجة تلقائيًا — بغض النظر عن
  // الصفحة المفتوحة دلوقتي.
  useEffect(() => {
    if (location) fetchAndSchedule(location);
    return () => clearScheduled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, settings.method, settings.madhab]);

  // تغيير إعدادات التذكيرات/التشغيل التلقائي لازم يعيد الجدولة فورًا (من
  // غير إعادة جلب من السيرفر، البيانات نفسها لسه صالحة).
  useEffect(() => {
    if (today) scheduleForDay(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoPlayEnabled, settings.reminders]);

  useEffect(() => clearScheduled, [clearScheduled]);

  const detectLocation = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      const pos = await requestGeolocation();
      const label = (await reverseGeocode(pos.lat, pos.lng)) || 'موقعك الحالي';
      const loc: PrayerLocation = { lat: pos.lat, lng: pos.lng, label, source: 'gps', accuracy: pos.accuracy };
      saveLocation(loc);
      setLocationState(loc);
      sounds.success();
      toast.success(`تم تحديد موقعك: ${label}`);
    } catch (err) {
      sounds.error();
      if (err instanceof GeolocationDeniedError) {
        toast.error(err.message);
      } else {
        toast.error(err instanceof Error ? err.message : 'تعذّر تحديد موقعك الجغرافي');
      }
      setError(err instanceof Error ? err.message : 'تعذّر تحديد موقعك الجغرافي');
    } finally {
      setLocating(false);
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<PrayerTimesSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const addReminder = useCallback((minutesBefore: number) => {
    if (!Number.isFinite(minutesBefore) || minutesBefore <= 0) return;
    const rounded = Math.round(minutesBefore);
    setSettings((prev) => (prev.reminders.includes(rounded) ? prev : { ...prev, reminders: [...prev.reminders, rounded].sort((a, b) => a - b) }));
  }, []);

  const removeReminder = useCallback((minutesBefore: number) => {
    setSettings((prev) => ({ ...prev, reminders: prev.reminders.filter((m) => m !== minutesBefore) }));
  }, []);

  const refreshCustomAdhans = useCallback(async () => {
    setCustomAdhans(await listCustomAdhans());
  }, []);

  const previewReciter = useCallback(async (selection: string) => {
    const url = await resolveAudioUrl(selection, customUrlCacheRef);
    const audio = audioRef.current;
    if (!audio || !url) return;
    audio.pause();
    audio.src = url;
    audio.volume = Math.min(1, Math.max(0, settingsRef.current.volume / 100));
    audio.currentTime = 0;
    audio.onended = () => setIsAzanPlaying(false);
    try {
      await audio.play();
      setIsAzanPlaying(true);
      setAzanPlayingLabel('معاينة صوت الأذان');
    } catch {
      // يحتاج تفاعل مستخدم أول — الزرار نفسه غالبًا كافي كتفاعل مباشر
    }
  }, []);

  const testAzanNow = useCallback(async () => {
    await playAzanFor(null, 'تجربة صوت الأذان');
  }, [playAzanFor]);

  const nextPrayer = useMemo(() => (today ? findNextPrayer(today.times, now) : null), [today, now]);
  const currentPrayer = useMemo(() => (today ? findCurrentPrayer(today.times, now) : null), [today, now]);

  const value: PrayerTimesContextValue = {
    location,
    locating,
    loadingTimes,
    error,
    today,
    now,
    nextPrayer,
    currentPrayer,
    settings,
    customAdhans,
    isAzanPlaying,
    azanPlayingLabel,
    detectLocation,
    updateSettings,
    addReminder,
    removeReminder,
    refreshCustomAdhans,
    previewReciter,
    stopAzan,
    testAzanNow,
    refresh,
  };

  return <PrayerTimesContext.Provider value={value}>{children}</PrayerTimesContext.Provider>;
}

export function usePrayerTimes(): PrayerTimesContextValue {
  const ctx = useContext(PrayerTimesContext);
  if (!ctx) throw new Error('usePrayerTimes لازم يُستخدم جوه PrayerTimesProvider');
  return ctx;
}

export type { TimingKey };
