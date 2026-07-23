// ===== حسابات دورة التكرار (Recurrence Math) =====
// كل الحسابات هنا بتتم على مستوى اليوم/الشهر/السنة مباشرة (من غير مكتبات
// خارجية زي date-fns) عشان تفضل بسيطة ومضبوطة مع حالات الحواف الشائعة زي
// "31 يناير + شهر" (لازم ترجع 28/29 فبراير مش تفيض لمارس تلقائيًا).

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

export const MIN_INTERVAL = 1;
// حد أقصى معقول لمنع دورات غريبة (كل 5000 سنة مثلاً) من غير ما نمنع حالات
// استخدام حقيقية زي "كل 6 شهور" أو "كل 3 أسابيع".
export const MAX_INTERVAL = 365;

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

// بتضيف دورة تكرار واحدة (interval وحدة من frequency) على تاريخ معين، وبترجع
// تاريخ جديد من غير ما تعدّل الأصلي. بتحافظ على نفس الساعة/الدقيقة بتاعة
// التاريخ الأصلي (وقت اليوم اللي المستخدم اختاره كبداية للتكرار).
export function addRecurrenceInterval(date: Date, frequency: RecurrenceFrequency, interval: number): Date {
  const n = Math.max(MIN_INTERVAL, Math.floor(interval) || 1);
  const d = new Date(date.getTime());

  if (frequency === 'DAILY') {
    d.setDate(d.getDate() + n);
    return d;
  }

  if (frequency === 'WEEKLY') {
    d.setDate(d.getDate() + n * 7);
    return d;
  }

  if (frequency === 'MONTHLY') {
    const targetDay = d.getDate();
    // بننقل لأول الشهر الأول عشان setMonth ميفيضش لشهر غلط لو الشهر الحالي
    // فيه أيام أكتر من اللي هيكونها الشهر الهدف (مثلاً 31 مارس + شهر).
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(targetDay, daysInMonth(d.getFullYear(), d.getMonth())));
    return d;
  }

  // YEARLY
  const targetDay = d.getDate();
  const targetMonth = d.getMonth();
  d.setDate(1);
  d.setFullYear(d.getFullYear() + n);
  d.setMonth(targetMonth);
  d.setDate(Math.min(targetDay, daysInMonth(d.getFullYear(), d.getMonth())));
  return d;
}

// بتقدّم تاريخ للأمام لحد ما يبقى بعد "now" — بتُستخدم في الجدولة عشان لو
// السيرفر كان واقف لمدة طويلة، منولّدش كل الدورات الفايتة (زي 40 نسخة يومية
// متراكمة)، وبدالها بنولّد نسخة واحدة بس تمثل آخر دورة فاتت، وبعدين نقفز
// مباشرة للدورة الجاية الحقيقية.
export function fastForward(date: Date, frequency: RecurrenceFrequency, interval: number, now: Date): Date {
  let next = date;
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 10000) {
    next = addRecurrenceInterval(next, frequency, interval);
    guard += 1;
  }
  return next;
}

// بتبني عنوان مميز لكل نسخة متولّدة بناءً على تاريخ الدورة، عشان تتفادى
// تعارض القيد الفريد (userId + title) على TodoList لو نفس القالب ولّد أكتر
// من نسخة، مع إبقاء العنوان مفهوم ومرتب للمستخدم.
export function occurrenceLabel(frequency: RecurrenceFrequency, occurrenceDate: Date): string {
  const day = occurrenceDate.getDate();
  const month = occurrenceDate.getMonth() + 1;
  const year = occurrenceDate.getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');

  if (frequency === 'YEARLY') return `${year}`;
  if (frequency === 'MONTHLY') return `${pad(month)}/${year}`;
  // يومي وأسبوعي بيحتاجوا اليوم بالظبط عشان يتفرقوا عن بعض
  return `${pad(day)}/${pad(month)}/${year}`;
}

export function buildOccurrenceTitle(baseTitle: string, frequency: RecurrenceFrequency, occurrenceDate: Date): string {
  return `${baseTitle} — ${occurrenceLabel(frequency, occurrenceDate)}`;
}
