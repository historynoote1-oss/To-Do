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

export type PomodoroPhase = 'focus' | 'break';
export type PomodoroStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface PomodoroSettings {
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  cyclesUntilLongBreak: number;
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  cyclesUntilLongBreak: 4,
};

interface PomodoroContextValue {
  settings: PomodoroSettings;
  updateSettings: (patch: Partial<PomodoroSettings>) => void;
  phase: PomodoroPhase;
  isLongBreak: boolean;
  status: PomodoroStatus;
  remainingSeconds: number;
  totalSeconds: number;
  focusStreak: number;
  completedFocusSessions: number;
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

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PomodoroSettings>(() => loadSettings());
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [isLongBreak, setIsLongBreak] = useState(false);
  const [status, setStatus] = useState<PomodoroStatus>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState(() => durationSeconds('focus', false, loadSettings()));
  const [focusStreak, setFocusStreak] = useState(0);
  const [completedFocusSessions, setCompletedFocusSessions] = useState(0);

  const endAtRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const statusRef = useRef<PomodoroStatus>('idle');
  statusRef.current = status;

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
      if (remaining <= 0) {
        clearTick();
        endAtRef.current = null;
        setStatus('finished');
        sounds.timelineEnd();
      }
    }, 250);
  }, [clearTick]);

  useEffect(() => clearTick, [clearTick]);

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
    },
    [applySettingsToIdleTimer]
  );

  // بدء العدّ لأي مرحلة — دايمًا فعل يدوي (زرار المستخدم هو اللي بينادي
  // الدالة دي)، مفيش نداء تلقائي ليها في أي مكان تاني في الملف.
  const beginCountdown = useCallback((forPhase: PomodoroPhase, forLongBreak: boolean, forSettings: PomodoroSettings) => {
    const total = durationSeconds(forPhase, forLongBreak, forSettings);
    endAtRef.current = Date.now() + total * 1000;
    setRemainingSeconds(total);
    setStatus('running');
    sounds.timelineStart();
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
        phase,
        isLongBreak,
        status,
        remainingSeconds,
        totalSeconds,
        focusStreak,
        completedFocusSessions,
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
