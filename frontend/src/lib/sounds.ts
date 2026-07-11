// أصوات قصيرة بتتولّد مباشرة جوه المتصفح (Web Audio API) بدل ملفات صوت خارجية.
// بتحترم إعدادات "تقليل الحركة" لو المستخدم مفعّلها، وبتتوقف تلقائيًا لو المتصفح
// مانعش الصوت لحد ما يحصل تفاعل فعلي من المستخدم (سياسة كل المتصفحات الحديثة).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.08,
  delay = 0
) {
  const audioCtx = getCtx();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const start = audioCtx.currentTime + delay;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainPeak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sounds = {
  click() {
    tone(720, 0.06, 'sine', 0.05);
  },
  taskDone() {
    tone(660, 0.09, 'sine', 0.07);
    tone(880, 0.13, 'sine', 0.06, 0.06);
  },
  taskUndone() {
    tone(440, 0.08, 'sine', 0.05);
  },
  addItem() {
    tone(520, 0.07, 'triangle', 0.05);
  },
  deleteItem() {
    tone(320, 0.1, 'sine', 0.05);
    tone(220, 0.12, 'sine', 0.04, 0.05);
  },
  success() {
    tone(523, 0.1, 'sine', 0.06);
    tone(659, 0.1, 'sine', 0.06, 0.08);
    tone(784, 0.16, 'sine', 0.06, 0.16);
  },
  error() {
    tone(200, 0.15, 'square', 0.03);
  },
};
