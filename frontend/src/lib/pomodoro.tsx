// حالة مؤقّت البومودورو مركزية (Context) — بنفس فكرة MusicPlayerProvider
// بالظبط. السبب: عايزين المؤقّت يفضل شغّال (يعدّ) حتى لو المستخدم اتنقّل
// من صفحة "بومودورو" لصفحة تانية في الموقع (المهام، الأرشيف...)، بدل ما
// يتقفل المكوّن ويوقف العدّ. فبننشئه مرة واحدة في أعلى شجرة التطبيق
// (main.tsx) وبيفضل حي طول عمر التطبيق، وأي صفحة تقدر تتابعه عن طريق
// useContext.
//
// أهم قاعدة في التصميم ده: **مفيش أي انتقال تلقائي بين المذاكرة والاستراحة**.
// لما وقت مرحلة يخلص، المؤقّت بيدخل حالة "finished" وبيوقف تمامًا وبيصدر
// صوت تنبيه، وبيفضل واقف لحد ما المستخدم نفسه يضغط زرار "ابدأ الاستراحة"
// أو "ابدأ المذاكرة" — يعني القرار والتحكم بالكامل في إيد المستخدم، مفيش
// عدّ تلقائي بيبدأ من غير ما هو يدوس بنفسه.
//
// كل الأوقات (مذاكرة/استراحة قصيرة/استراحة طويلة/عدد الدورات) قابلة
// للتعديل بالكامل من غير أي حد أدنى/أقصى مفروض على المستخدم (غير حماية
// بسيطة من قيم غير منطقية زي صفر أو سالب).

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { sounds } from './sounds';
import { toast } from './toast';

export type PomodoroPhase = 'focus' | 'break';
export type PomodoroStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface PomodoroSettings {
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  cyclesUntilLongBreak: number;
}

// قالب إعدادات محفوظ باسم مخصوص من المستخدم — عشان يقدر يبدّل بين أكتر
// من "وضع" (مثلاً "مذاكرة عميقة"، "مراجعة سريعة"، "قراءة") بضغطة واحدة
// من غير ما يعيد كتابة كل رقم في كل مرة.
export interface PomodoroPreset {
  id: string;
  name: string;
  settings: PomodoroSettings;
  createdAt: number;
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  cyclesUntilLongBreak: 4,
};

export const MAX_PRESETS = 12;
export const MAX_PRESET_NAME_LENGTH = 30;

interface PomodoroContextValue {
  settings: PomodoroSettings;
  updateSettings: (patch: Partial<PomodoroSettings>) => void;
  presets: PomodoroPreset[];
  activePresetId: string | null;
  savePreset: (name: string) => boolean;
  applyPreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
  deletePreset: (id: string) => void;
  phase: PomodoroPhase;
  isLongBreak: boolean;
  status: PomodoroStatus;
  remainingSeconds: number;
  totalSeconds: number;
  focusStreak: number;
  completedFocusSessions: number;
  todayFocusMinutes: number;
  nextPhaseLabel: string;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  startNextPhase: () => void;
  skip: () => void;
}

const PomodoroContext = createContext<PomodoroContextValue | null>(null);

const SETTINGS_KEY = 'pomodoro.settings';

function loadSettings(): PomodoroSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_POMODORO_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      focusMinutes: clampMinutes(parsed.focusMinutes, DEFAULT_POMODORO_SETTINGS.focusMinutes),
      breakMinutes: clampMinutes(parsed.breakMinutes, DEFAULT_POMODORO_SETTINGS.breakMinutes),
      longBreakMinutes: clampMinutes(parsed.longBreakMinutes, DEFAULT_POMODORO_SETTINGS.longBreakMinutes),
      cyclesUntilLongBreak: clampCycles(parsed.cyclesUntilLongBreak, DEFAULT_POMODORO_SETTINGS.cyclesUntilLongBreak),
    };
  } catch {
    return DEFAULT_POMODORO_SETTINGS;
  }
}

function saveSettings(settings: PomodoroSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // تخزين محلي مش متاح — نتجاهل بهدوء، مش أساسي لعمل المؤقّت نفسه.
  }
}

const PRESETS_KEY = 'pomodoro.presets';

function makePresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizePresetSettings(raw: unknown): PomodoroSettings {
  const src = (raw ?? {}) as Partial<Record<keyof PomodoroSettings, unknown>>;
  return {
    focusMinutes: clampMinutes(src.focusMinutes, DEFAULT_POMODORO_SETTINGS.focusMinutes),
    breakMinutes: clampMinutes(src.breakMinutes, DEFAULT_POMODORO_SETTINGS.breakMinutes),
    longBreakMinutes: clampMinutes(src.longBreakMinutes, DEFAULT_POMODORO_SETTINGS.longBreakMinutes),
    cyclesUntilLongBreak: clampCycles(src.cyclesUntilLongBreak, DEFAULT_POMODORO_SETTINGS.cyclesUntilLongBreak),
  };
}

// قوالب الإعدادات المحفوظة بتتخزّن محليًا (نفس أسلوب الإعدادات العادية)
// عشان تفضل موجودة حتى من غير حساب/سيرفر — كل قالب اسم + 4 أرقام بس.
function loadPresets(): PomodoroPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).name === 'string')
      .slice(0, MAX_PRESETS)
      .map((p) => ({
        id: typeof p.id === 'string' && p.id ? p.id : makePresetId(),
        name: String(p.name).slice(0, MAX_PRESET_NAME_LENGTH),
        settings: sanitizePresetSettings(p.settings),
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

function persistPresets(presets: PomodoroPreset[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // زي حفظ الإعدادات العادية — لو التخزين المحلي مش متاح نتجاهل بهدوء.
  }
}

const TODAY_FOCUS_KEY = 'pomodoro.todayFocusMinutes';

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// إجمالي دقايق المذاكرة "النهاردة" — بيتصفّر تلقائيًا لو اليوم اتغيّر،
// وبيفضل محفوظ حتى لو المستخدم قفل التطبيق ورجعله تاني في نفس اليوم
// (على عكس عدّاد "دورات المذاكرة" اللي بيصفّر مع كل تحميل للصفحة).
function loadTodayFocusMinutes(): number {
  try {
    const raw = localStorage.getItem(TODAY_FOCUS_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.date !== todayDateKey()) return 0;
    const n = Number(parsed.minutes);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function persistTodayFocusMinutes(minutes: number) {
  try {
    localStorage.setItem(TODAY_FOCUS_KEY, JSON.stringify({ date: todayDateKey(), minutes }));
  } catch {
    // نفس منطق التسامح مع غياب التخزين المحلي في باقي الملف.
  }
}

// حماية بسيطة: مفيش حد أدنى/أقصى "مفروض" فعليًا على المستخدم (زي 25
// دقيقة تحديدًا)، لكن بنمنع قيم مالهاش معنى زي صفر أو سالب أو أرقام
// عملاقة تكسر الواجهة — أقل قيمة دقيقة واحدة، وأقصى قيمة 6 ساعات.
function clampMinutes(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(360, Math.round(n * 10) / 10);
}

function clampCycles(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(20, Math.round(n));
}

function durationSeconds(phase: PomodoroPhase, isLongBreak: boolean, settings: PomodoroSettings): number {
  if (phase === 'focus') return Math.round(settings.focusMinutes * 60);
  return Math.round((isLongBreak ? settings.longBreakMinutes : settings.breakMinutes) * 60);
}

// نفس صيغة تسمية المرحلة المستخدمة في واجهة Pomodoro.tsx، بس هنا كنص عادي
// عشان يتحط جوه رسائل التنبيه (توست + إشعار المتصفح).
function phaseLabel(phase: PomodoroPhase, isLongBreak: boolean): string {
  return phase === 'focus' ? 'المذاكرة' : isLongBreak ? 'الاستراحة الطويلة' : 'الاستراحة';
}

// عتبة تحذير "قرب الوقت يخلص" متكيّفة مع مدة المرحلة نفسها: 60 ثانية
// للمراحل العادية (زي مذاكرة 25 دقيقة أو استراحة 5 دقايق)، لكن لو المستخدم
// ظبط مدة قصيرة جدًا (أقل من دقيقتين) بننزّل العتبة لنص المدة عشان التحذير
// يبان في نص الوقت مش يتشغّل فور ما العدّ يبدأ. مراحل أقصر من 10 ثواني
// أصلًا مالهاش تحذير منفصل عن النهاية.
function warningThreshold(totalSeconds: number): number {
  if (totalSeconds <= 10) return 0;
  if (totalSeconds > 120) return 60;
  return Math.max(5, Math.floor(totalSeconds / 2));
}

// إشعار جهاز فعلي (مش توست جوه الصفحة بس) — بيوصل للمستخدم كإشعار نظام
// حقيقي فوق أي تطبيق تاني فاتحه، مش بس لما يكون بعيد عن التاب. لسه مشروط
// بإذن الإشعارات (ensureNotificationPermission تحت بتطلبه أول ما المستخدم
// يبدأ المؤقّت).
function notifyBrowser(title: string, body: string) {
  try {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: '/icon-192.png', tag: 'pomodoro' });
  } catch {
    // إشعارات الجهاز مش أساسية لعمل المؤقّت — أي فشل هنا بنتجاهله بهدوء.
  }
}

// بيطلب إذن إشعارات الجهاز أول ما المستخدم يبدأ/يكمّل المؤقّت بنفسه (فعل
// مستخدم فعلي زي ضغطة زرار، وده شرط المتصفحات عشان تسمح بنافذة الإذن
// أصلًا — مش ممكن تتطلب تلقائيًا من غير تفاعل). لو الإذن اتاخد قبل كده
// (granted) أو اترفض (denied) مش بيعمل حاجة تانية؛ بيسأل بس أول مرة
// (default) وبهدوء تام لو المتصفح مش بيدعم الإشعارات أصلًا.
function ensureNotificationPermission() {
  try {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch {
    // نفس منطق التسامح فوق.
  }
}

// حفظ "حالة" المؤقّت نفسه (المرحلة الحالية، حالته، الوقت المتبقي، عدد
// الدورات المكتملة...) عشان لو المستخدم عمل refresh للصفحة أو رجع تاني
// بعدين، يلاقي كل حاجة زي ما سابها بالظبط بدل ما يبدأ من الصفر. بنخزّن
// وقت "النهاية" الفعلي (endAt) مش العدّ التنازلي نفسه، عشان لو الوقت فات
// إحنا احنا مسافرين (مثلاً قفل التاب لمدة أطول من الوقت المتبقي) نقدر
// نحسب صح إن المرحلة خلصت.
const TIMER_STATE_KEY = 'pomodoro.timerState';

interface PersistedTimerState {
  phase: PomodoroPhase;
  isLongBreak: boolean;
  status: PomodoroStatus;
  endAt: number | null;
  remainingSeconds: number;
  focusStreak: number;
  completedFocusSessions: number;
}

function loadTimerState(): PersistedTimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const phase: PomodoroPhase = parsed.phase === 'break' ? 'break' : 'focus';
    const status: PomodoroStatus = ['idle', 'running', 'paused', 'finished'].includes(parsed.status)
      ? parsed.status
      : 'idle';
    return {
      phase,
      isLongBreak: !!parsed.isLongBreak,
      status,
      endAt: typeof parsed.endAt === 'number' ? parsed.endAt : null,
      remainingSeconds: Number.isFinite(Number(parsed.remainingSeconds)) ? Math.max(0, Number(parsed.remainingSeconds)) : 0,
      focusStreak: Number.isFinite(Number(parsed.focusStreak)) ? Math.max(0, Math.round(Number(parsed.focusStreak))) : 0,
      completedFocusSessions: Number.isFinite(Number(parsed.completedFocusSessions))
        ? Math.max(0, Math.round(Number(parsed.completedFocusSessions)))
        : 0,
    };
  } catch {
    return null;
  }
}

function persistTimerState(state: PersistedTimerState) {
  try {
    localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(state));
  } catch {
    // نفس منطق التسامح مع غياب التخزين المحلي في باقي الملف.
  }
}

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const initialSettings = loadSettings();
  const initialTimerState = loadTimerState();

  const [settings, setSettings] = useState<PomodoroSettings>(initialSettings);
  const [phase, setPhase] = useState<PomodoroPhase>(initialTimerState?.phase ?? 'focus');
  const [isLongBreak, setIsLongBreak] = useState(initialTimerState?.isLongBreak ?? false);
  const [status, setStatus] = useState<PomodoroStatus>(() => {
    if (!initialTimerState) return 'idle';
    // لو كان شغّال وقت ما المستخدم قفل الصفحة، هنقرر حالته الحقيقية دلوقتي
    // (لسه شغّال ولا خلص فعلاً وهو مقفول) في الـ effect بعد أول render،
    // فبنبدأ هنا بحالة مؤقتة "running" لو كانت كده، وهنصححها فورًا.
    return initialTimerState.status;
  });
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    if (initialTimerState) {
      if (initialTimerState.status === 'running' && initialTimerState.endAt) {
        return Math.max(0, Math.round((initialTimerState.endAt - Date.now()) / 1000));
      }
      return initialTimerState.remainingSeconds;
    }
    return durationSeconds('focus', false, initialSettings);
  });
  const [focusStreak, setFocusStreak] = useState(initialTimerState?.focusStreak ?? 0);
  const [completedFocusSessions, setCompletedFocusSessions] = useState(initialTimerState?.completedFocusSessions ?? 0);
  const [presets, setPresets] = useState<PomodoroPreset[]>(() => loadPresets());
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [todayFocusMinutes, setTodayFocusMinutes] = useState<number>(() => loadTodayFocusMinutes());

  const endAtRef = useRef<number | null>(
    initialTimerState?.status === 'running' ? initialTimerState.endAt : null
  );
  const intervalRef = useRef<number | null>(null);
  const statusRef = useRef<PomodoroStatus>(initialTimerState?.status ?? 'idle');
  statusRef.current = status;

  // Refs بتتزامن مع أحدث قيمة لحظة كل render — الـ tick (setInterval) بتاع
  // startTick مبنيّ يفضل نفس الدالة طول عمر المؤقّت (من غير ما يتعاد إنشاؤه
  // مع كل تغيير)، فلازم يقرا المرحلة/الإعدادات الحالية من refs مش من
  // متغيرات مقفولة (closure) وقت إنشائه، وإلا كان هيفضل شغّال على قيم قديمة.
  const phaseRef = useRef<PomodoroPhase>(phase);
  phaseRef.current = phase;
  const isLongBreakRef = useRef(isLongBreak);
  isLongBreakRef.current = isLongBreak;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // بيتصفّر مع كل بداية عدّ جديدة (beginCountdown) عشان تنبيه "قرب يخلص"
  // يتشغّل مرة واحدة بالظبط لكل مرحلة، مش في كل tick بعد ما يعدّي العتبة.
  const warnedRef = useRef(false);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // العدّاد بيعتمد على وقت نهاية فعلي (timestamp) بدل ما ينقص ثانية كل
  // tick، عشان يفضل دقيق حتى لو المتصفح "خنق" التبويب وهو في الخلفية
  // (تبويب غير نشط) — وده بالظبط سبب استخدام نفس أسلوب مشغّل الصوت.
  const startTick = useCallback(() => {
    clearTick();
    intervalRef.current = window.setInterval(() => {
      if (!endAtRef.current) return;
      const remaining = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setRemainingSeconds(remaining);

      // تنبيه "قرب الوقت يخلص" — مرة واحدة بس لكل مرحلة، بصوت واضح ورسالة
      // على الشاشة، وكمان إشعار جهاز لو المستخدم مش شايف التاب أصلًا.
      if (!warnedRef.current && remaining > 0) {
        const total = durationSeconds(phaseRef.current, isLongBreakRef.current, settingsRef.current);
        if (remaining <= warningThreshold(total)) {
          warnedRef.current = true;
          const label = phaseLabel(phaseRef.current, isLongBreakRef.current);
          sounds.pomodoroWarning();
          toast.reminder(`⏳ متبقّي أقل من دقيقة على نهاية ${label}!`);
          notifyBrowser('بومودورو — قرب الوقت يخلص', `متبقّي أقل من دقيقة على نهاية ${label}.`);
        }
      }

      if (remaining <= 0) {
        clearTick();
        endAtRef.current = null;
        setStatus('finished');
        const label = phaseLabel(phaseRef.current, isLongBreakRef.current);
        sounds.pomodoroEnd();
        toast.reminder(`⏰ انتهى وقت ${label}!`);
        notifyBrowser('بومودورو — انتهى الوقت', `انتهى وقت ${label}.`);
      }
    }, 250);
  }, [clearTick]);

  useEffect(() => clearTick, [clearTick]);

  // كل مرة أي حاجة في "تقدّم" المؤقّت تتغيّر (المرحلة، حالته، الوقت
  // المتبقي، عدد الدورات/الجلسات) بنخزّنها فورًا، عشان أي refresh أو
  // إغلاق للتاب متاخدش حاجة من المستخدم.
  useEffect(() => {
    persistTimerState({
      phase,
      isLongBreak,
      status,
      endAt: endAtRef.current,
      remainingSeconds,
      focusStreak,
      completedFocusSessions,
    });
  }, [phase, isLongBreak, status, remainingSeconds, focusStreak, completedFocusSessions]);

  // عند أول تحميل للصفحة فقط: لو كان فيه عدّ شغّال قبل ما المستخدم يعمل
  // refresh، لازم نتأكد هل الوقت خلص وهو مقفول ولا لسه شغّال فعلاً،
  // وبعدين نكمّل العدّ التلقائي (setInterval) من غير ما نبدأ مرحلة جديدة
  // من الصفر.
  useEffect(() => {
    if (initialTimerState?.status === 'running') {
      const endAt = initialTimerState.endAt;
      if (!endAt || endAt <= Date.now()) {
        // الوقت خلص فعلاً وإحنا مسافرين — ندخل حالة "finished" زي لو كنا
        // فاتحين الصفحة والمؤقّت خلص لتوّه.
        endAtRef.current = null;
        setRemainingSeconds(0);
        setStatus('finished');
      } else {
        // لسه فيه وقت متبقي — نكمّل العدّ من غير ما نغيّر أي حاجة تانية.
        startTick();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySettingsToIdleTimer = useCallback(
    (next: PomodoroSettings) => {
      if (statusRef.current === 'idle') {
        setRemainingSeconds(durationSeconds(phase, isLongBreak, next));
      }
    },
    [phase, isLongBreak]
  );

  const updateSettings = useCallback(
    (patch: Partial<PomodoroSettings>) => {
      setSettings((prev) => {
        const next: PomodoroSettings = {
          focusMinutes: clampMinutes(patch.focusMinutes ?? prev.focusMinutes, prev.focusMinutes),
          breakMinutes: clampMinutes(patch.breakMinutes ?? prev.breakMinutes, prev.breakMinutes),
          longBreakMinutes: clampMinutes(patch.longBreakMinutes ?? prev.longBreakMinutes, prev.longBreakMinutes),
          cyclesUntilLongBreak: clampCycles(patch.cyclesUntilLongBreak ?? prev.cyclesUntilLongBreak, prev.cyclesUntilLongBreak),
        };
        saveSettings(next);
        applySettingsToIdleTimer(next);
        return next;
      });
      // تعديل يدوي لأي رقم معناه إننا ابتعدنا عن القالب المحفوظ اللي كان
      // مطبّق (لو فيه)، فبنشيل علامة "القالب النشط" عشان الواجهة متبقاش
      // مضلّلة إنه لسه مطابق للقالب.
      setActivePresetId(null);
    },
    [applySettingsToIdleTimer]
  );

  // حفظ الإعدادات الحالية كقالب جديد باسم يختاره المستخدم. بيرجع true/false
  // عشان الواجهة تقدر توضّح لو الاسم فاضي أو العدد وصل للحد الأقصى.
  const savePreset = useCallback(
    (name: string): boolean => {
      const trimmed = name.trim().slice(0, MAX_PRESET_NAME_LENGTH);
      if (!trimmed) return false;
      let ok = false;
      setPresets((prev) => {
        if (prev.length >= MAX_PRESETS) {
          ok = false;
          return prev;
        }
        const preset: PomodoroPreset = { id: makePresetId(), name: trimmed, settings, createdAt: Date.now() };
        const next = [...prev, preset];
        persistPresets(next);
        ok = true;
        setActivePresetId(preset.id);
        return next;
      });
      return ok;
    },
    [settings]
  );

  // تطبيق قالب محفوظ: بيحدّث كل الأربع قيم دفعة واحدة (زي updateSettings)
  // وبيعلّم القالب ده كـ"نشط" عشان يتوضّح في الواجهة إنه المطبّق دلوقتي.
  const applyPreset = useCallback(
    (id: string) => {
      setPresets((currentPresets) => {
        const preset = currentPresets.find((p) => p.id === id);
        if (preset) {
          setSettings(preset.settings);
          saveSettings(preset.settings);
          applySettingsToIdleTimer(preset.settings);
          setActivePresetId(preset.id);
        }
        return currentPresets;
      });
    },
    [applySettingsToIdleTimer]
  );

  const renamePreset = useCallback((id: string, name: string) => {
    const trimmed = name.trim().slice(0, MAX_PRESET_NAME_LENGTH);
    if (!trimmed) return;
    setPresets((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p));
      persistPresets(next);
      return next;
    });
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persistPresets(next);
      return next;
    });
    setActivePresetId((prev) => (prev === id ? null : prev));
  }, []);

  // بدء العدّ لأي مرحلة — دايمًا فعل يدوي (زرار المستخدم هو اللي بينادي
  // الدالة دي)، مفيش نداء تلقائي ليها في أي مكان تاني في الملف.
  const beginCountdown = useCallback((forPhase: PomodoroPhase, forLongBreak: boolean, forSettings: PomodoroSettings) => {
    const total = durationSeconds(forPhase, forLongBreak, forSettings);
    endAtRef.current = Date.now() + total * 1000;
    warnedRef.current = false;
    setRemainingSeconds(total);
    setStatus('running');
    sounds.timelineStart();
    ensureNotificationPermission();
  }, []);

  const start = useCallback(() => {
    if (statusRef.current !== 'idle') return;
    beginCountdown(phase, isLongBreak, settings);
    startTick();
  }, [beginCountdown, startTick, phase, isLongBreak, settings]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return;
    clearTick();
    if (endAtRef.current) {
      setRemainingSeconds(Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000)));
    }
    endAtRef.current = null;
    setStatus('paused');
  }, [clearTick]);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    endAtRef.current = Date.now() + remainingSeconds * 1000;
    setStatus('running');
    startTick();
    ensureNotificationPermission();
  }, [remainingSeconds, startTick]);

  const reset = useCallback(() => {
    clearTick();
    endAtRef.current = null;
    setStatus('idle');
    setRemainingSeconds(durationSeconds(phase, isLongBreak, settings));
  }, [clearTick, phase, isLongBreak, settings]);

  // بيحسب المرحلة الجاية (استراحة عادية/طويلة، أو مذاكرة) لكن من غير ما
  // يبدأها فعليًا — البدء الفعلي بيحصل بس لما المستخدم يضغط الزرار
  // (startNextPhase)، فمفيش أي عدّ تلقائي بيبدأ لوحده.
  function computeNextPhase(): { phase: PomodoroPhase; isLongBreak: boolean } {
    if (phase === 'focus') {
      const nextStreak = focusStreak + 1;
      const triggersLongBreak = nextStreak % settings.cyclesUntilLongBreak === 0;
      return { phase: 'break', isLongBreak: triggersLongBreak };
    }
    return { phase: 'focus', isLongBreak: false };
  }

  const startNextPhase = useCallback(() => {
    if (statusRef.current !== 'finished') return;
    if (phase === 'focus') {
      setFocusStreak((prev) => (prev + 1) % settings.cyclesUntilLongBreak);
      setCompletedFocusSessions((prev) => prev + 1);
      const nextTotal = Math.round((loadTodayFocusMinutes() + settings.focusMinutes) * 10) / 10;
      persistTodayFocusMinutes(nextTotal);
      setTodayFocusMinutes(nextTotal);
    }
    const { phase: nextPhase, isLongBreak: nextLong } = computeNextPhase();
    setPhase(nextPhase);
    setIsLongBreak(nextLong);
    beginCountdown(nextPhase, nextLong, settings);
    startTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, settings, focusStreak, beginCountdown, startTick]);

  // تخطّي المرحلة الحالية يدويًا (مثلاً المستخدم قرر يقفل المذاكرة بدري) —
  // فعل يدوي كمان، بيوقف المرحلة الحالية وبيدخل حالة "finished" عشان
  // المستخدم يقرر بنفسه يبدأ المرحلة الجاية إمتى.
  const skip = useCallback(() => {
    if (statusRef.current === 'idle') return;
    clearTick();
    endAtRef.current = null;
    setRemainingSeconds(0);
    setStatus('finished');
  }, [clearTick]);

  const totalSeconds = durationSeconds(phase, isLongBreak, settings);
  const nextPhaseLabel = (() => {
    if (phase === 'focus') {
      const nextStreak = focusStreak + 1;
      return nextStreak % settings.cyclesUntilLongBreak === 0 ? 'استراحة طويلة' : 'استراحة';
    }
    return 'مذاكرة';
  })();

  return (
    <PomodoroContext.Provider
      value={{
        settings,
        updateSettings,
        presets,
        activePresetId,
        savePreset,
        applyPreset,
        renamePreset,
        deletePreset,
        phase,
        isLongBreak,
        status,
        remainingSeconds,
        totalSeconds,
        focusStreak,
        completedFocusSessions,
        todayFocusMinutes,
        nextPhaseLabel,
        start,
        pause,
        resume,
        reset,
        startNextPhase,
        skip,
      }}
    >
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro(): PomodoroContextValue {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoro لازم يُستخدم جوه PomodoroProvider');
  return ctx;
}
