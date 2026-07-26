// بيصيغ عدد الثواني كـ "m:ss"، بيتعامل مع القيم السالبة/غير المنتهية (زي لو
// التايمر لسه ما بدأش أو فيه قيمة NaN لحظية) بإرجاع 0:00 بدل ما يطلع نص
// غلط. كانت الدالة دي متكررة في Pomodoro وMusicPlayer بفروق طفيفة في
// التعامل مع الحواف.
export function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const m = Math.floor(safeSeconds / 60);
  const s = (safeSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
