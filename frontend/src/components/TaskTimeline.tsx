import { useEffect, useRef, useState } from 'react';
import { updateList } from '../lib/api';
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
}

interface Props {
  list: ListLike;
  onChange: () => void;
}

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export default function TaskTimeline({ list, onChange }: Props) {
  const start = list.startTime ? new Date(list.startTime) : null;
  const end = list.endTime ? new Date(list.endTime) : null;
  const scheduled = !!(start && end);

  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [startDraft, setStartDraft] = useState('');
  const [endDraft, setEndDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const prevPhaseRef = useRef<Phase>('unset');
  const firedStartRef = useRef(false);
  const firedWarnRef = useRef(false);
  const firedEndRef = useRef(false);
  const initializedRef = useRef(false);

  // بنشتغل بس لو فيه جدول زمني فعلاً — عشان مش نفتح تيك كل ثانية لمهام
  // مفيهاش مؤقت أصلًا.
  useEffect(() => {
    if (!scheduled) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [scheduled]);

  // لحظة ما الجدول الزمني نفسه يتغيّر (تحديد جديد / تعديل / مسح)، بنصفّر
  // كل علامات "الصوت اتشغّل قبل كده" ونعيد تهيئة المرحلة الأولية من غير ما
  // نطلق صوت لمجرد إننا لسه فاتحين الصفحة أو عدّلنا الجدول.
  useEffect(() => {
    const s = start ? start.getTime() : null;
    const e = end ? end.getTime() : null;
    const phase = computePhase(Date.now(), s, e);
    prevPhaseRef.current = phase;
    firedStartRef.current = phase !== 'upcoming';
    firedEndRef.current = phase === 'ended';
    const fraction = phase === 'active' && s !== null && e !== null ? (e - Date.now()) / (e - s) : 1;
    firedWarnRef.current = phase === 'ended' || (phase === 'active' && fraction <= WARN_FRACTION);
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.startTime, list.endTime]);

  const s = start ? start.getTime() : null;
  const e = end ? end.getTime() : null;
  const phase = computePhase(now, s, e);
  const fraction = phase === 'active' && s !== null && e !== null ? Math.min(1, Math.max(0, (e - now) / (e - s))) : 1;

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

  function openEditor() {
    setStartDraft(start ? toDatetimeLocalValue(start) : toDatetimeLocalValue(new Date(Date.now() + 5 * 60 * 1000)));
    setEndDraft(end ? toDatetimeLocalValue(end) : toDatetimeLocalValue(new Date(Date.now() + 65 * 60 * 1000)));
    setEditing(true);
  }

  async function handleSave() {
    if (!startDraft || !endDraft) {
      toast.error('حدد وقت البداية والنهاية');
      return;
    }
    const startVal = new Date(startDraft);
    const endVal = new Date(endDraft);
    if (endVal.getTime() <= startVal.getTime()) {
      toast.error('وقت البداية لازم يكون قبل وقت النهاية');
      return;
    }
    setSaving(true);
    try {
      await updateList(list.id, { startTime: startVal.toISOString(), endTime: endVal.toISOString() });
      sounds.click();
      toast.success('اتحدد الجدول الزمني للمهمة');
      setEditing(false);
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ الجدول الزمني');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await updateList(list.id, { startTime: null, endTime: null });
      sounds.click();
      setEditing(false);
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر مسح الجدول الزمني');
    } finally {
      setSaving(false);
    }
  }

  const barColor =
    fraction > 0.5 ? 'var(--success)' : fraction > CRITICAL_FRACTION ? 'var(--timeline-warn)' : 'var(--danger)';
  const critical = phase === 'active' && fraction <= CRITICAL_FRACTION;
  const ended = phase === 'ended';

  // مربع مضغوط بس (نص السطر تقريبًا) — من غير أي كلام/نص وصفي، بس أيقونة
  // للعرض + بار (لو في وقت شغال) + الرقم التنازلي نفسه. لما المهمة لسه ما
  // بدأتش بيبقى وقت تذكير تنازلي، ولما تبدأ بيتحول لعدّاد+بار، ولما ينتهي
  // الوقت الكل بيبقى أحمر.
  return (
    <>
      <button
        type="button"
        className={`timeline-compact timeline-compact-${phase} ${critical || ended ? 'timeline-compact-critical' : ''}`}
        onClick={openEditor}
        aria-label="الجدول الزمني للمهمة"
        title="الجدول الزمني للمهمة"
      >
        <span className="timeline-compact-icon" aria-hidden="true">
          <DynamicIcon name={!scheduled ? 'timer' : phase === 'upcoming' ? 'bell' : ended ? 'hourglass' : 'timer'} size={13} />
        </span>

        {scheduled && (phase === 'active' || ended) && (
          <span className="timeline-compact-bar">
            <span
              className="timeline-compact-bar-fill"
              style={{ width: `${(ended ? 1 : fraction) * 100}%`, background: ended ? 'var(--danger)' : barColor }}
            />
          </span>
        )}

        {!scheduled && <span className="timeline-compact-add">جدول</span>}

        {scheduled && phase === 'upcoming' && (
          <span className="timeline-compact-time" dir="ltr">{formatClock((s! - now) / 1000)}</span>
        )}

        {scheduled && phase === 'active' && (
          <span className="timeline-compact-time" dir="ltr">{formatClock((e! - now) / 1000)}</span>
        )}

        {scheduled && ended && (
          <span className="timeline-compact-time" dir="ltr">00:00</span>
        )}
      </button>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal-box timeline-modal" onClick={(e) => e.stopPropagation()}>
            <h2><DynamicIcon name="timer" size={18} /> الجدول الزمني لـ «{list.title}»</h2>
            <div className="timeline-form-row">
              <label>وقت البداية</label>
              <input type="datetime-local" value={startDraft} onChange={(e) => setStartDraft(e.target.value)} />
            </div>
            <div className="timeline-form-row">
              <label>وقت النهاية</label>
              <input type="datetime-local" value={endDraft} onChange={(e) => setEndDraft(e.target.value)} />
            </div>
            <div className="modal-actions">
              {scheduled && (
                <button type="button" className="danger small" onClick={handleClear} disabled={saving}>
                  مسح الجدول
                </button>
              )}
              <button type="button" className="small" onClick={() => setEditing(false)} disabled={saving}>
                إلغاء
              </button>
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? '...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
