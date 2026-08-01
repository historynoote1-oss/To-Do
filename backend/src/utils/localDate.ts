// السيرفر بيشتغل بتوقيت UTC، لكن المستخدمين مش كلهم UTC (غالبًا توقيت
// القاهرة UTC+2). لو اعتمدنا على تاريخ السيرفر بس، أي مستخدم بيخلّص مهامه
// بعد نص الليل المحلي بس قبل نص الليل UTC (يعني بين الساعة 12 و2 صباحًا
// تقريبًا بتوقيت القاهرة) هيتسجّل إنجازه على يوم غلط في UserActivityDay،
// وده كان بيكسر سلسلة الاستريك بشكل عشوائي وغير متوقع.
//
// الحل: العميل (المتصفح) هو اللي عارف يومه المحلي صح، فبيبعته صراحةً كنص
// "YYYY-MM-DD" مع أي طلب بيأثر على الاستريك. الدوال هنا بتتحقق من الصيغة
// وتحوّلها لـ Date بمنتصف ليل UTC (نفس الصيغة المخزّنة في العمود @db.Date)،
// مع fallback آمن لتاريخ السيرفر UTC لو العميل قديم ومبعتش التاريخ.

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// بيحوّل نص "YYYY-MM-DD" لـ Date بمنتصف ليل UTC، أو null لو الصيغة غلط أو
// التاريخ نفسه مش موجود فعليًا (زي 2024-02-30).
export function parseLocalDateKey(input: unknown): Date | null {
  if (typeof input !== 'string') return null;
  const match = DATE_KEY_RE.exec(input);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  // بيتأكد إن التاريخ فعلي (مش "طفح" لشهر تاني، زي يوم 31 في شهر بـ30 يوم)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

// بديل احتياطي لو العميل مبعتش تاريخ محلي — بياخد يوم السيرفر بتوقيت UTC
// (السلوك القديم، ممكن يكون غير دقيق لمستخدمين بتوقيتات تانية).
export function utcDayFrom(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// بيرجّع يوم UserActivityDay الصحيح اللي نسجّل عليه الإنجاز: بيفضّل التاريخ
// المحلي اللي بعته العميل، ولو مش موجود أو غلط بيرجع ليوم السيرفر UTC.
export function resolveActivityDay(localDateInput: unknown, fallback: Date = new Date()): Date {
  return parseLocalDateKey(localDateInput) ?? utcDayFrom(fallback);
}
