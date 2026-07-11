// أصوات قصيرة بتتولّد مباشرة جوه المتصفح (Web Audio API) بدل ملفات صوت خارجية.
// بتحترم إعدادات "تقليل الحركة" لو المستخدم مفعّلها، وبتتوقف تلقائيًا لو المتصفح
// مانعش الصوت لحد ما يحصل تفاعل فعلي من المستخدم (سياسة كل المتصفحات الحديثة).
// كل الأصوات بتتبني بطبقات (oscillator + filter + gain) عشان تبقى أدفى وأقرب
// لأصوات التطبيقات الاحترافية، مش نغمة واحدة ناشفة.

const MUTE_KEY = 'soundsMuted';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(MUTE_KEY) === 'true';
}

function getCtx(): { audioCtx: AudioContext; master: GainNode } | null {
  if (typeof window === 'undefined') return null;
  if (isMuted()) return null;

  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
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
  },
  toggleMuted() {
    const next = !isMuted();
    sounds.setMuted(next);
    if (!next) sounds.click();
    return next;
  },

  click() {
    tone({ freq: 720, duration: 0.05, type: 'sine', gainPeak: 0.045 });
  },
  hover() {
    tone({ freq: 950, duration: 0.03, type: 'sine', gainPeak: 0.015 });
  },
  taskDone() {
    tone({ freq: 587, duration: 0.09, type: 'sine', gainPeak: 0.07, filterFreq: 2400 });
    tone({ freq: 880, duration: 0.15, type: 'sine', gainPeak: 0.055, delay: 0.05, filterFreq: 3200 });
  },
  taskUndone() {
    tone({ freq: 440, duration: 0.08, type: 'sine', gainPeak: 0.045, pitchGlideTo: 340 });
  },
  addItem() {
    tone({ freq: 480, duration: 0.07, type: 'triangle', gainPeak: 0.05 });
    tone({ freq: 720, duration: 0.09, type: 'sine', gainPeak: 0.035, delay: 0.03 });
  },
  deleteItem() {
    tone({ freq: 340, duration: 0.1, type: 'sine', gainPeak: 0.045, pitchGlideTo: 180 });
    tone({ freq: 220, duration: 0.12, type: 'sine', gainPeak: 0.03, delay: 0.04 });
  },
  success() {
    tone({ freq: 523, duration: 0.1, type: 'sine', gainPeak: 0.06 });
    tone({ freq: 659, duration: 0.1, type: 'sine', gainPeak: 0.055, delay: 0.08 });
    tone({ freq: 784, duration: 0.18, type: 'sine', gainPeak: 0.055, delay: 0.16 });
  },
  error() {
    tone({ freq: 210, duration: 0.14, type: 'square', gainPeak: 0.025, filterFreq: 800 });
    tone({ freq: 170, duration: 0.16, type: 'square', gainPeak: 0.02, delay: 0.06, filterFreq: 700 });
  },
  celebrate() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, i) => {
      tone({ freq, duration: 0.22, type: 'sine', gainPeak: 0.05, delay: i * 0.08, filterFreq: 3800 });
    });
  },
};
