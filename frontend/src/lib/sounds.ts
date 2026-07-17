// أصوات قصيرة بتتولّد مباشرة جوه المتصفح (Web Audio API) بدل ملفات صوت خارجية.
// بتحترم إعدادات "تقليل الحركة" لو المستخدم مفعّلها، وبتتوقف تلقائيًا لو المتصفح
// مانعش الصوت لحد ما يحصل تفاعل فعلي من المستخدم (سياسة كل المتصفحات الحديثة).
// كل الأصوات بتتبني بطبقات (oscillator + filter + gain) عشان تبقى أدفى وأقرب
// لأصوات التطبيقات الاحترافية، مش نغمة واحدة ناشفة.

const MUTE_KEY = 'soundsMuted';
const VOLUME_KEY = 'soundsVolume'; // 0..100, بيتحفظ منفصل عن الكتم عشان لو المستخدم
// كتم الصوت مؤقتًا، رجوعه يبقى بنفس المستوى اللي كان مختاره قبل كده.
const DEFAULT_VOLUME = 75;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

// مستمعين خارجيين (زرار الكتم في الهيدر + صفحة الإعدادات) عشان يفضلوا
// متزامنين مع بعض لحظيًا لو المستخدم غيّر الإعداد من أي مكان.
type SoundsListener = (state: { muted: boolean; volume: number }) => void;
const listeners = new Set<SoundsListener>();

function emitChange() {
  const state = { muted: isMuted(), volume: getVolume() };
  listeners.forEach((l) => l(state));
}

function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(MUTE_KEY) === 'true';
}

function getVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME;
  const raw = localStorage.getItem(VOLUME_KEY);
  if (raw === null) return DEFAULT_VOLUME;
  const n = Number(raw);
  if (Number.isNaN(n)) return DEFAULT_VOLUME;
  return Math.min(100, Math.max(0, n));
}

function applyVolumeToGraph() {
  if (masterGain) {
    masterGain.gain.value = getVolume() / 100;
  }
}

function getCtx(): { audioCtx: AudioContext; master: GainNode } | null {
  if (typeof window === 'undefined') return null;
  if (isMuted()) return null;
  if (getVolume() <= 0) return null;

  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = getVolume() / 100;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return { audioCtx: ctx, master: masterGain! };
}

interface ToneOpts {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gainPeak?: number;
  delay?: number;
  filterFreq?: number;
  pitchGlideTo?: number;
}

function tone({
  freq,
  duration,
  type = 'sine',
  gainPeak = 0.08,
  delay = 0,
  filterFreq,
  pitchGlideTo,
}: ToneOpts) {
  const setup = getCtx();
  if (!setup) return;
  const { audioCtx, master } = setup;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;

  const start = audioCtx.currentTime + delay;
  osc.frequency.setValueAtTime(freq, start);
  if (pitchGlideTo) {
    osc.frequency.exponentialRampToValueAtTime(pitchGlideTo, start + duration);
  }

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainPeak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  let node: AudioNode = osc;
  if (filterFreq) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    osc.connect(filter);
    node = filter;
  }
  node.connect(gain);
  gain.connect(master);

  osc.start(start);
  osc.stop(start + duration + 0.03);
}

export const sounds = {
  isMuted,
  setMuted(muted: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MUTE_KEY, String(muted));
    emitChange();
  },
  toggleMuted() {
    const next = !isMuted();
    sounds.setMuted(next);
    if (!next) sounds.click();
    return next;
  },

  // ===== مستوى الصوت (0 → 100) =====
  getVolume,
  setVolume(value: number, opts: { preview?: boolean } = {}) {
    if (typeof window === 'undefined') return;
    const clamped = Math.round(Math.min(100, Math.max(0, value)));
    localStorage.setItem(VOLUME_KEY, String(clamped));
    applyVolumeToGraph();
    emitChange();
    if (opts.preview && clamped > 0) sounds.click();
  },

  // بيسمح لأي كومبوننت (زرار الهيدر، صفحة الإعدادات) يتابع تغييرات
  // الكتم/مستوى الصوت لحظيًا حتى لو التغيير حصل من مكان تاني في الشجرة.
  subscribe(listener: SoundsListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  click() {
    tone({ freq: 720, duration: 0.055, type: 'sine', gainPeak: 0.09 });
  },
  hover() {
    tone({ freq: 950, duration: 0.035, type: 'sine', gainPeak: 0.032 });
  },
  taskDone() {
    tone({ freq: 587, duration: 0.1, type: 'sine', gainPeak: 0.13, filterFreq: 2600 });
    tone({ freq: 880, duration: 0.16, type: 'sine', gainPeak: 0.1, delay: 0.05, filterFreq: 3400 });
  },
  taskUndone() {
    tone({ freq: 440, duration: 0.09, type: 'sine', gainPeak: 0.085, pitchGlideTo: 340 });
  },
  addItem() {
    tone({ freq: 480, duration: 0.08, type: 'triangle', gainPeak: 0.095 });
    tone({ freq: 720, duration: 0.1, type: 'sine', gainPeak: 0.065, delay: 0.03 });
  },
  deleteItem() {
    tone({ freq: 340, duration: 0.11, type: 'sine', gainPeak: 0.085, pitchGlideTo: 180 });
    tone({ freq: 220, duration: 0.13, type: 'sine', gainPeak: 0.055, delay: 0.04 });
  },
  // نقرة دافئة قصيرة بطبقتين متقاربتين — إحساس "اتحفظ التعديل" هادئ وواثق،
  // مختلفة عن addItem (نغمة صاعدة أوضح) وعن click (نغمة واحدة محايدة).
  editItem() {
    tone({ freq: 560, duration: 0.07, type: 'sine', gainPeak: 0.08, filterFreq: 3000 });
    tone({ freq: 700, duration: 0.09, type: 'sine', gainPeak: 0.07, delay: 0.045, filterFreq: 3400 });
  },
  // نغمة إشعار عامة وخفيفة (مش نجاح ولا خطأ) — لأي تنبيه معلوماتي بسيط.
  notify() {
    tone({ freq: 610, duration: 0.06, type: 'sine', gainPeak: 0.06, filterFreq: 3200 });
    tone({ freq: 610, duration: 0.08, type: 'sine', gainPeak: 0.05, delay: 0.1, filterFreq: 3200 });
  },
  success() {
    tone({ freq: 523, duration: 0.11, type: 'sine', gainPeak: 0.11 });
    tone({ freq: 659, duration: 0.11, type: 'sine', gainPeak: 0.1, delay: 0.08 });
    tone({ freq: 784, duration: 0.19, type: 'sine', gainPeak: 0.1, delay: 0.16 });
  },
  error() {
    tone({ freq: 210, duration: 0.15, type: 'square', gainPeak: 0.05, filterFreq: 850 });
    tone({ freq: 170, duration: 0.17, type: 'square', gainPeak: 0.04, delay: 0.06, filterFreq: 750 });
  },
  celebrate() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, i) => {
      tone({ freq, duration: 0.24, type: 'sine', gainPeak: 0.095, delay: i * 0.08, filterFreq: 4000 });
    });
  },
  // صوت بيتغيّر طبقته حسب مستوى الأولوية المُختارة (0 بدون → 4 حرجة):
  // كل ما الأولوية أعلى، النغمة أعلى وأوضح، فالودن نفسه بيدّي إحساس بالخطورة.
  priorityChange(level: number) {
    const base = 380 + level * 95;
    tone({ freq: base, duration: 0.075, type: 'triangle', gainPeak: 0.08 + level * 0.012, filterFreq: 3000 });
    if (level >= 4) {
      tone({ freq: base * 1.5, duration: 0.09, type: 'sine', gainPeak: 0.075, delay: 0.05, filterFreq: 4200 });
    }
  },
  // نغمة تذكير مميزة (جرس بطبقتين) — لازم تبقى واضحة ومنفصلة عن باقي
  // الأصوات عشان المستخدم يميّزها فورًا حتى لو مش شايف الشاشة وقتها.
  reminder() {
    tone({ freq: 660, duration: 0.14, type: 'sine', gainPeak: 0.11, filterFreq: 3600 });
    tone({ freq: 880, duration: 0.18, type: 'sine', gainPeak: 0.1, delay: 0.12, filterFreq: 4200 });
    tone({ freq: 660, duration: 0.14, type: 'sine', gainPeak: 0.09, delay: 0.32, filterFreq: 3600 });
  },

  // ===== أصوات مؤقت المهمة (Task Timeline) =====
  // نغمة صاعدة ودافئة تدّي إحساس "انطلاق" — بتتشغّل لحظة ما وقت البداية يجي.
  timelineStart() {
    tone({ freq: 494, duration: 0.12, type: 'triangle', gainPeak: 0.1, filterFreq: 3200 });
    tone({ freq: 740, duration: 0.16, type: 'sine', gainPeak: 0.1, delay: 0.09, filterFreq: 3800 });
  },
  // نقرتين سريعتين وحادتين نسبيًا — إنذار لطيف إن الوقت أوشك يخلص من غير ما
  // يبقى مزعج، بيتشغّل مرة واحدة بس لكل مهمة.
  timelineWarning() {
    tone({ freq: 720, duration: 0.07, type: 'triangle', gainPeak: 0.09, filterFreq: 3400 });
    tone({ freq: 720, duration: 0.07, type: 'triangle', gainPeak: 0.085, delay: 0.14, filterFreq: 3400 });
  },
  // نغمة هابطة واضحة تدّي إحساس "خلص الوقت" لحظة ما العداد يوصل للصفر.
  timelineEnd() {
    tone({ freq: 500, duration: 0.16, type: 'sine', gainPeak: 0.1, filterFreq: 2800, pitchGlideTo: 340 });
    tone({ freq: 340, duration: 0.22, type: 'sine', gainPeak: 0.09, delay: 0.12, filterFreq: 2200 });
  },
};
