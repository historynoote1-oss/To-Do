import { useEffect, useState } from 'react';
import { DynamicIcon } from '../lib/icons';

// ═══════════════════════════════════════════════════════════════════
// مكوّن TaskTimeline — شريط عرض فقط (لا يقبل نقر ولا تعديل)
// بيعرض في سطر واحد:
//   • عداد الوقت لأقرب تذكير قادم (بأيقونة الجرس)
//   • عداد تنازلي لوقت انتهاء المهمة مع شريط تقدّم (بأيقونة الساعة)
// ═══════════════════════════════════════════════════════════════════

interface ReminderLite {
  id: string;
  remindAt: string;
}

interface TaskTimelineProps {
  list: {
    reminders?: ReminderLite[];
    dueDate?: string | null;
    deadline?: string | null;
    createdAt?: string | null;
  };
  onChange?: () => void;
}

// تحويل الفرق الزمني بالثواني لنص عربي مختصر
function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return 'انتهى';
  const totalSecs = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (days >= 2) return `${days} يوم`;
  if (days === 1) {
    if (hours > 0) return `يوم و${hours} س`;
    return 'يوم';
  }
  if (hours >= 1) return `${hours}س ${mins}د`;
  if (mins >= 1) return `${mins}د ${secs}ث`;
  return `${secs}ث`;
}

// تحويل الفرق الزمني للتذكير لنص عربي مختصر
function formatReminderCountdown(diffMs: number): string {
  if (diffMs <= 0) return 'الآن';
  const totalSecs = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);

  if (days >= 1) return `${days === 1 ? 'يوم' : days + ' أيام'}`;
  if (hours >= 1) return `${hours} س`;
  if (mins >= 1) return `${mins} د`;
  return 'الآن';
}

export default function TaskTimeline({ list }: TaskTimelineProps) {
  const [now, setNow] = useState(() => Date.now());

  // تحديث الوقت كل ثانية لتحريك العدادات
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // أقرب تذكير قادم
  const nextReminder = list.reminders
    ?.filter((r) => new Date(r.remindAt).getTime() > now)
    .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime())[0] ?? null;

  // وقت انتهاء المهمة (dueDate أو deadline)
  const deadlineStr = list.dueDate || list.deadline || null;
  const deadlineMs = deadlineStr ? new Date(deadlineStr).getTime() : null;

  // وقت الإنشاء للحساب النسبي للشريط
  const createdMs = list.createdAt ? new Date(list.createdAt).getTime() : null;

  // حساب نسبة الوقت المتبقي للشريط (0→100%)
  let deadlineProgress = 0;
  if (deadlineMs && createdMs && deadlineMs > createdMs) {
    const total = deadlineMs - createdMs;
    const elapsed = now - createdMs;
    deadlineProgress = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  }

  const reminderDiff = nextReminder ? new Date(nextReminder.remindAt).getTime() - now : null;
  const deadlineDiff = deadlineMs ? deadlineMs - now : null;
  const isDeadlineOver = deadlineDiff !== null && deadlineDiff <= 0;

  // لو مفيش تذكير ولا deadline — مفيش حاجة تتعرض
  if (!nextReminder && !deadlineMs) return null;

  return (
    <div className="task-timeline" aria-label="مؤشرات الوقت">
      {/* عداد التذكير */}
      {nextReminder && reminderDiff !== null && (
        <span
          className="task-timeline-reminder"
          title={`التذكير في ${new Date(nextReminder.remindAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`}
        >
          <DynamicIcon name="bell" size={11} />
          <span className="task-timeline-value">{formatReminderCountdown(reminderDiff)}</span>
        </span>
      )}

      {/* عداد الـ deadline مع شريط تقدّم */}
      {deadlineMs !== null && deadlineDiff !== null && (
        <span
          className={`task-timeline-deadline ${isDeadlineOver ? 'overdue' : ''}`}
          title={`ينتهي في ${new Date(deadlineMs).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`}
        >
          <DynamicIcon name={isDeadlineOver ? 'alert-circle' : 'clock'} size={11} />
          <span className="task-timeline-value">{formatCountdown(deadlineDiff)}</span>
          <span
            className="task-timeline-bar"
            role="progressbar"
            aria-valuenow={deadlineProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className={`task-timeline-bar-fill ${deadlineProgress >= 90 ? 'danger' : deadlineProgress >= 70 ? 'warning' : ''}`}
              style={{ width: `${deadlineProgress}%` }}
            />
          </span>
        </span>
      )}
    </div>
  );
}
