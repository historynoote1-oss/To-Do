import { useEffect, useState } from 'react';
import { Reminder, getReminders, createReminder, deleteReminder, updateItemDueDate } from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import { DynamicIcon } from '../lib/icons';
import Portal from './Portal';

type Target =
  | { kind: 'list'; id: string; title: string }
  | { kind: 'item'; id: string; title: string; dueDate: string | null };

interface Props {
  target: Target;
  onClose: () => void;
  onDueDateChange?: (dueDate: string | null) => void;
}

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// بيفكّ عدد الدقايق الكلي لثلاث خانات مستقلة (أيام / ساعات / دقايق) عشان
// نعرضها في تعديل تذكير قائم أو في وصفه.
function splitOffsetMinutes(totalMinutes: number) {
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes };
}

// بيصيغ "يوم و٣ ساعات و٢٠ دقيقة" من قيم الخانات الثلاث، وبيتجاهل أي خانة فاضية.
function formatOffsetParts(days: number, hours: number, minutes: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(days === 1 ? 'يوم' : days === 2 ? 'يومين' : `${days} أيام`);
  if (hours > 0) parts.push(hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : `${hours} ساعات`);
  if (minutes > 0) parts.push(minutes === 1 ? 'دقيقة' : minutes === 2 ? 'دقيقتين' : `${minutes} دقيقة`);
  if (parts.length === 0) return '0 دقيقة';
  return parts.join(' و');
}

function describeReminder(r: Reminder): string {
  const when = new Date(r.remindAt).toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  if (r.mode === 'BEFORE_DUE' && r.offsetMinutes) {
    const { days, hours, minutes } = splitOffsetMinutes(r.offsetMinutes);
    return `قبل الاستحقاق بـ ${formatOffsetParts(days, hours, minutes)} — ${when}`;
  }
  return when;
}

export default function RemindersModal({ target, onClose, onDueDateChange }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'CUSTOM' | 'BEFORE_DUE'>('CUSTOM');
  const [customValue, setCustomValue] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 30 * 60 * 1000)));
  // ثلاث خانات مستقلة للتذكير النسبي — المستخدم يعبّي أي خانة أو أكتر
  // (يوم / ساعتين / ٣٠ دقيقة / يوم + ٣ ساعات... إلخ)
  const [offsetDays, setOffsetDays] = useState('');
  const [offsetHours, setOffsetHours] = useState('');
  const [offsetMinutes, setOffsetMinutes] = useState('30');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dueDateDraft, setDueDateDraft] = useState(
    target.kind === 'item' && target.dueDate ? toDatetimeLocalValue(new Date(target.dueDate)) : ''
  );
  const [currentDueDate, setCurrentDueDate] = useState(target.kind === 'item' ? target.dueDate : null);
  const [savingDueDate, setSavingDueDate] = useState(false);

  const hasDueDate = target.kind === 'item' && !!currentDueDate;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasDueDate && mode === 'BEFORE_DUE') setMode('CUSTOM');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDueDate]);

  async function load() {
    setLoading(true);
    try {
      const data = await getReminders(target.kind === 'item' ? { itemId: target.id } : { listId: target.id });
      setReminders(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل التذكيرات');
    } finally {
      setLoading(false);
    }
  }

  async function saveDueDate(value: string | null) {
    if (target.kind !== 'item') return;
    setSavingDueDate(true);
    try {
      const updated = await updateItemDueDate(target.id, value ? new Date(value).toISOString() : null);
      setCurrentDueDate(updated.dueDate);
      onDueDateChange?.(updated.dueDate);
      sounds.click();
      if (value) toast.success('اتحدد موعد الاستحقاق');
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث موعد الاستحقاق');
    } finally {
      setSavingDueDate(false);
    }
  }

  // مجموع الدقايق من الخانات الثلاث. أي خانة فاضية أو غير رقمية بتتحسب صفر.
  const totalOffsetMinutes =
    (Number(offsetDays) || 0) * 60 * 24 + (Number(offsetHours) || 0) * 60 + (Number(offsetMinutes) || 0);

  async function handleAdd() {
    if (submitting) return;
    if (mode === 'BEFORE_DUE' && totalOffsetMinutes <= 0) {
      toast.error('عبّي خانة واحدة على الأقل (أيام / ساعات / دقايق)');
      return;
    }
    if (mode === 'CUSTOM' && !customValue) {
      toast.error('حدد وقت التذكير');
      return;
    }
    setSubmitting(true);
    try {
      await createReminder({
        listId: target.kind === 'list' ? target.id : undefined,
        itemId: target.kind === 'item' ? target.id : undefined,
        mode,
        remindAt: mode === 'CUSTOM' ? new Date(customValue).toISOString() : undefined,
        offsetMinutes: mode === 'BEFORE_DUE' ? totalOffsetMinutes : undefined,
        message: message.trim() || undefined,
      });
      sounds.addItem();
      toast.success('اتضاف التذكير');
      setMessage('');
      await load();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّرت إضافة التذكير');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const snapshot = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== id));
    try {
      await deleteReminder(id);
      sounds.deleteItem();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف التذكير');
      setReminders(snapshot);
    }
  }

  return (
    <Portal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box reminders-modal" onClick={(e) => e.stopPropagation()}>
        <h2><DynamicIcon name="bell" size={18} /> تذكيرات «{target.title}»</h2>

        {target.kind === 'item' && (
          <div className="reminders-duedate-row">
            <span className="reminders-duedate-label">موعد استحقاق المهمة</span>
            <div className="reminders-duedate-controls">
              <input type="datetime-local" value={dueDateDraft} onChange={(e) => setDueDateDraft(e.target.value)} />
              <button type="button" className="small" onClick={() => saveDueDate(dueDateDraft)} disabled={savingDueDate}>
                {savingDueDate ? '...' : 'حفظ'}
              </button>
              {currentDueDate && (
                <button
                  type="button"
                  className="small danger"
                  onClick={() => {
                    setDueDateDraft('');
                    saveDueDate(null);
                  }}
                  disabled={savingDueDate}
                >
                  مسح
                </button>
              )}
            </div>
          </div>
        )}

        <div className="reminders-list">
          {loading && <p className="empty">جارِ التحميل...</p>}
          {!loading && reminders.length === 0 && <p className="empty">لسه مفيش تذكيرات لهذه المهمة</p>}
          {!loading &&
            reminders.map((r) => (
              <div key={r.id} className="reminder-row">
                <span className="reminder-row-icon"><DynamicIcon name="bell" size={14} /></span>
                <div className="reminder-row-text">
                  <span className="reminder-row-when">{describeReminder(r)}</span>
                  {r.message && <span className="reminder-row-message">{r.message}</span>}
                </div>
                <button type="button" className="danger small" onClick={() => handleDelete(r.id)} aria-label="حذف التذكير">
                  <DynamicIcon name="x" size={13} />
                </button>
              </div>
            ))}
        </div>

        <div className="reminders-add">
          <div className="reminders-mode-tabs" role="tablist">
            <button type="button" className={mode === 'CUSTOM' ? 'active' : ''} onClick={() => setMode('CUSTOM')} role="tab" aria-selected={mode === 'CUSTOM'}>
              وقت مخصص
            </button>
            <button
              type="button"
              className={mode === 'BEFORE_DUE' ? 'active' : ''}
              onClick={() => setMode('BEFORE_DUE')}
              role="tab"
              aria-selected={mode === 'BEFORE_DUE'}
              disabled={!hasDueDate}
              title={hasDueDate ? undefined : 'حدد موعد استحقاق للمهمة الأول'}
            >
              قبل الاستحقاق
            </button>
          </div>

          {mode === 'CUSTOM' ? (
            <input type="datetime-local" value={customValue} onChange={(e) => setCustomValue(e.target.value)} />
          ) : (
            <div className="reminders-offset-block">
              <div className="reminders-offset-fields">
                <label className="reminders-offset-field">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={offsetDays}
                    onChange={(e) => setOffsetDays(e.target.value.replace(/[^0-9]/g, ''))}
                    aria-label="عدد الأيام"
                  />
                  <span>يوم</span>
                </label>
                <label className="reminders-offset-field">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={offsetHours}
                    onChange={(e) => setOffsetHours(e.target.value.replace(/[^0-9]/g, ''))}
                    aria-label="عدد الساعات"
                  />
                  <span>ساعة</span>
                </label>
                <label className="reminders-offset-field">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={offsetMinutes}
                    onChange={(e) => setOffsetMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                    aria-label="عدد الدقايق"
                  />
                  <span>دقيقة</span>
                </label>
              </div>
              <div className="reminders-offset-preview">
                {totalOffsetMinutes > 0 ? (
                  <>
                    <DynamicIcon name="bell" size={12} />
                    قبل الاستحقاق بـ {formatOffsetParts(Number(offsetDays) || 0, Number(offsetHours) || 0, Number(offsetMinutes) || 0)}
                  </>
                ) : (
                  'عبّي خانة واحدة على الأقل'
                )}
              </div>
            </div>
          )}

          <input
            className="reminders-message-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="رسالة التذكير (اختياري)"
            maxLength={200}
          />

          <button type="button" onClick={handleAdd} disabled={submitting}>
            {submitting ? 'جارِ الإضافة...' : '+ إضافة تذكير'}
          </button>
        </div>

        <div className="modal-actions">
          <button className="small" onClick={onClose} type="button">
            إغلاق
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
