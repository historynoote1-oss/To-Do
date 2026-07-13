import { useEffect, useRef, useState } from 'react';
import { getReminders, Reminder } from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import { DynamicIcon } from '../lib/icons';

// نسبة الوقت المتبقي اللي عندها بنعتبر المهمة "قريبة من النهاية" (بنطلق
// تنبيه صوتي وبصري مرة واحدة)، وبنفس القيمة تقريبًا بيدخل الشريط في وضع
// "حرج" (نبضة حمراء). أي قيمة أقل من كده بتتحسب حرجة.
const WARN_FRACTION = 0.15;
const CRITICAL_FRACTION = 0.1;

type Phase = 'unset' | 'upcoming' | 'active' | 'ended';

interface ListLike {
  id: string;
  title: string;
  startTime?: string | null;
  endTime?: string | null;
  _count?: { reminders?: number };
}

interface Props {
  list: ListLike;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function computePhase(now: number, start: number | null, end: number | null): Phase {
  if (start === null || end === null) return 'unset';
  if (now < start) return 'upcoming';
  if (now <= end) return 'active';
  return 'ended';
}

// عنصر واحد بس بياخد باقي سطر البيانات الثابتة (بعد الأولوية/التصنيف/
// مجال الحياة)، وبيعرض واحدة من حاجتين مفيش بينهم تداخل خالص:
//
//  ١) لسه المهمة ما بدأتش (أو مفيش جدول زمني للمهمة أصلًا) وفيه تذكيرات
//     متحددة لها: بيعرض أيقونة جرس + عدّاد تنازلي لأقرب تذكير قادم. لما
//     العدّاد يوصل صفر، التذكير ده يبقى "فات" فبيتنقل تلقائيًا لأقرب
//     تذكير تاني لسه معلّق، لحد ما تخلص كل التذكيرات (الإرسال الفعلي/
//     الإشعار بيتكفّل بيه الاستقصاء العام في App.tsx بغض النظر عن المكوّن ده).
//
//  ٢) دخل وقت بداية المهمة: بيتحول لعدّاد تنازلي لوقت نهاية المهمة مع
//     شريط بار بينقص كل ثانية، ولما الوقت يخلص يبقى العدّاد والبار
//     بلون أحمر بس.
//
// العنصر ده عرض فقط — مفيش أي تعديل مباشر منه، التعديل كله بقى من نافذة
// تعديل المهمة (أيقونة القلم).
export default function TaskTimeline({ list }: Props) {
  const start = list.startTime ? new Date(list.startTime).getTime() : null;
  const end = list.endTime ? new Date(list.endTime).getTime() : null;
  const scheduled = start !== null && end !== null;
  const reminderCount = list._count?.reminders ?? 0;

  const [now, setNow] = useState(() => Date.now());
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const prevPhaseRef = useRef<Phase>('unset');
  const firedStartRef = useRef(false);
  const firedWarnRef = useRef(false);
  const firedEndRef = useRef(false);
  const initializedRef = useRef(false);

  // بنجيب تذكيرات المهمة بس لو فيه عدد تذكيرات فعلاً، وبنعيد الجلب لما
  // العدد ده يتغيّر (إضافة/حذف من نافذة التعديل).
  useEffect(() => {
    if (reminderCount === 0) {
      setReminders([]);
      return;
    }
    let cancelled = false;
    getReminders({ listId: list.id })
      .then((data) => {
        if (!cancelled) setReminders(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [list.id, reminderCount]);

  // لحظة ما الجدول الزمني نفسه يتغيّر (تحديد جديد / تعديل / مسح)، بنصفّر
  // كل علامات "الصوت اتشغّل قبل كده" ونعيد تهيئة المرحلة الأولية من غير ما
  // نطلق صوت لمجرد إننا لسه فاتحين الصفحة أو عدّلنا الجدول.
  useEffect(() => {
    const phase = computePhase(Date.now(), start, end);
    prevPhaseRef.current = phase;
    firedStartRef.current = phase !== 'upcoming';
    firedEndRef.current = phase === 'ended';
    const fraction = phase === 'active' && start !== null && end !== null ? (end - Date.now()) / (end - start) : 1;
    firedWarnRef.current = phase === 'ended' || (phase === 'active' && fraction <= WARN_FRACTION);
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.startTime, list.endTime]);

  const phase = computePhase(now, start, end);
  const showTaskTimer = phase === 'active' || phase === 'ended';

  // أقرب تذكير لسه معلّق (وقته لسه ما جاش) — بيتحسب من جديد كل تيك، فلما
  // تذكير يفوت وقته بيختفي من الفلتر ده تلقائيًا ويطلع اللي بعده.
  const nextReminder =
    reminders
      .filter((r) => new Date(r.remindAt).getTime() > now)
      .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime())[0] || null;

  const shouldTick = showTaskTimer ? phase === 'active' : !!nextReminder;

  // بنشتغل بس لو فيه حاجة فعلاً بتتحسب (جدول شغال، أو تذكير قادم لسه ما
  // جاش وقته) — عشان مش نفتح تيك كل ثانية من غير داعي.
  useEffect(() => {
    if (!shouldTick) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [shouldTick]);

  const fraction =
    phase === 'active' && start !== null && end !== null ? Math.min(1, Math.max(0, (end - now) / (end - start))) : 1;

  useEffect(() => {
    if (!initializedRef.current || !scheduled) return;
    const prev = prevPhaseRef.current;

    if (phase === 'active' && prev !== 'active' && !firedStartRef.current) {
      firedStartRef.current = true;
      sounds.timelineStart();
      toast.info(`بدأت المهمة "${list.title}"`);
    }

    if (phase === 'active' && fraction <= WARN_FRACTION && !firedWarnRef.current) {
      firedWarnRef.current = true;
      sounds.timelineWarning();
      toast.reminder(`الوقت قرّب يخلص في "${list.title}"`);
    }

    if (phase === 'ended' && prev !== 'ended' && !firedEndRef.current) {
      firedEndRef.current = true;
      sounds.timelineEnd();
      toast.error(`انتهى وقت المهمة "${list.title}"`);
    }

    prevPhaseRef.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, fraction]);

  const barColor =
    fraction > 0.5 ? 'var(--success)' : fraction > CRITICAL_FRACTION ? 'var(--timeline-warn)' : 'var(--danger)';
  const critical = phase === 'active' && fraction <= CRITICAL_FRACTION;
  const ended = phase === 'ended';

  if (showTaskTimer) {
    return (
      <div
        className={`timeline-compact timeline-compact-readonly timeline-compact-has-bar timeline-compact-${phase} ${
          critical || ended ? 'timeline-compact-critical' : ''
        }`}
        role="img"
        aria-label="الوقت المتبقي للمهمة"
        title="الوقت المتبقي للمهمة"
      >
        <span className="timeline-compact-icon" aria-hidden="true">
          <DynamicIcon name={ended ? 'hourglass' : 'timer'} size={13} />
        </span>

        <span className="timeline-compact-bar">
          <span
            className="timeline-compact-bar-fill"
            style={{ width: `${(ended ? 1 : fraction) * 100}%`, background: ended ? 'var(--danger)' : barColor }}
          />
        </span>

        <span className="timeline-compact-time" dir="ltr">
          {ended ? '00:00' : formatClock((end! - now) / 1000)}
        </span>
      </div>
    );
  }

  if (nextReminder) {
    return (
      <div
        className="timeline-compact timeline-compact-readonly timeline-compact-upcoming"
        role="img"
        aria-label="الوقت المتبقي لأقرب تذكير"
        title="الوقت المتبقي لأقرب تذكير"
      >
        <span className="timeline-compact-icon" aria-hidden="true">
          <DynamicIcon name="bell" size={13} />
        </span>
        <span className="timeline-compact-time" dir="ltr">
          {formatClock((new Date(nextReminder.remindAt).getTime() - now) / 1000)}
        </span>
      </div>
    );
  }

  return null;
}
