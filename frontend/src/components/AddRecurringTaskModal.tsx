import { useEffect, useMemo, useRef, useState } from 'react';
import { PriorityPicker } from './Priority';
import { LifeAreaPicker } from './LifeArea';
import { PriorityKey, priorityOf } from '../lib/priority';
import { LifeAreaData } from '../lib/lifeArea';
import { FREQUENCY_OPTIONS, RecurrenceFrequency, intervalDescription } from '../lib/recurrence';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';

export interface NewRecurringSubtask {
  content: string;
  priority: PriorityKey;
}

export interface NewRecurringTaskPayload {
  title: string;
  priority: PriorityKey;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string; // yyyy-mm-dd
  lifeAreaId: string | null;
  items: NewRecurringSubtask[];
}

interface Props {
  open: boolean;
  lifeAreas: LifeAreaData[];
  onClose: () => void;
  onManageLifeAreas: () => void;
  onCreate: (data: NewRecurringTaskPayload) => Promise<void> | void;
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type StepId = 'title' | 'subtasks' | 'priority' | 'frequency' | 'startDate' | 'lifeArea' | 'review';

interface StepDef {
  id: StepId;
  label: string;
  icon: string;
}

const STEPS: StepDef[] = [
  { id: 'title', label: 'اسم المهمة', icon: 'sparkles' },
  { id: 'subtasks', label: 'المهام الفرعية الثابتة', icon: 'list-checks' },
  { id: 'priority', label: 'الأولوية', icon: 'flag' },
  { id: 'frequency', label: 'دورة التكرار', icon: 'repeat' },
  { id: 'startDate', label: 'أول تكرار', icon: 'calendar' },
  { id: 'lifeArea', label: 'مجال الحياة', icon: 'compass' },
  { id: 'review', label: 'المراجعة', icon: 'check' },
];

// نافذة إنشاء مهمة متكررة جديدة — بنفس نظام نافذة "إضافة مهمة" العادية
// بالضبط: مراحل مرتبة، شريط تقدّم بالخطوات، مراجعة نهائية قبل التأكيد،
// بدل النموذج الطويل القديم اللي كل حاجة فيه في شاشة واحدة مزدحمة.
export default function AddRecurringTaskModal({ open, lifeAreas, onClose, onManageLifeAreas, onCreate }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  const [title, setTitle] = useState('');
  const [items, setItems] = useState<NewRecurringSubtask[]>([]);
  const [itemDraft, setItemDraft] = useState('');
  const [priority, setPriority] = useState<PriorityKey>('MEDIUM');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('DAILY');
  const [interval, setIntervalValue] = useState(1);
  const [startDate, setStartDate] = useState(todayIso());
  const [lifeAreaId, setLifeAreaId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setTitle('');
      setItems([]);
      setItemDraft('');
      setPriority('MEDIUM');
      setFrequency('DAILY');
      setIntervalValue(1);
      setStartDate(todayIso());
      setLifeAreaId(null);
      setSubmitting(false);
      setStepError('');
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    document.body.classList.add('modal-lock-scroll');
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.classList.remove('modal-lock-scroll');
    };
  }, [open, onClose]);

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const trimmedTitle = title.trim();

  function addItem() {
    const value = itemDraft.trim();
    if (!value) return;
    setItems((prev) => [...prev, { content: value, priority: 'NONE' }]);
    setItemDraft('');
    sounds.hover();
    requestAnimationFrame(() => itemRef.current?.focus());
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function validateStep(): string | null {
    if (step.id === 'title' && !trimmedTitle) return 'اكتب اسم المهمة الأول';
    if (step.id === 'startDate' && !startDate) return 'حدد تاريخ أول تكرار';
    return null;
  }

  function goNext() {
    const err = validateStep();
    if (err) {
      setStepError(err);
      sounds.error();
      return;
    }
    setStepError('');
    sounds.hover();
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }

  function goBack() {
    setStepError('');
    if (isFirst) {
      onClose();
      return;
    }
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function goToStep(index: number) {
    if (index >= stepIndex) return;
    setStepError('');
    setStepIndex(index);
  }

  async function handleSubmit() {
    const err = validateStep();
    if (err) {
      setStepError(err);
      sounds.error();
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await onCreate({ title: trimmedTitle, priority, frequency, interval, startDate, lifeAreaId, items });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const reviewLifeArea = useMemo(() => lifeAreas.find((a) => a.id === lifeAreaId) || null, [lifeAreas, lifeAreaId]);
  const reviewPriority = useMemo(() => priorityOf(priority), [priority]);

  if (!open) return null;

  return (
    <div className="modal-overlay add-task-overlay" onClick={onClose}>
      <div
        className="modal-box add-task-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-recurring-title"
      >
        <div className="add-task-header">
          <h2 id="add-recurring-title">
            <DynamicIcon name={step.icon} size={18} /> {step.label}
          </h2>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="إغلاق">
            <DynamicIcon name="x" size={16} />
          </button>
        </div>

        <div className="wizard-steps" role="tablist" aria-label="مراحل إنشاء المهمة المتكررة">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`wizard-step-dot ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
              onClick={() => goToStep(i)}
              disabled={i > stepIndex}
              aria-label={s.label}
              aria-current={i === stepIndex}
              title={s.label}
            >
              {i < stepIndex ? <DynamicIcon name="check" size={11} /> : <span>{i + 1}</span>}
            </button>
          ))}
        </div>

        <div className="add-task-body">
          {step.id === 'title' && (
            <div className="add-task-field">
              <label htmlFor="add-recurring-input" className="add-task-label">
                اسم المهمة
              </label>
              <input
                id="add-recurring-input"
                ref={titleRef}
                className="add-task-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: مراجعة المصاريف الشهرية"
                maxLength={80}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    goNext();
                  }
                }}
              />
            </div>
          )}

          {step.id === 'subtasks' && (
            <div className="add-task-field">
              <span className="add-task-label">المهام الفرعية الثابتة (اختياري)</span>
              <p className="wizard-empty-hint">بتتكرر تلقائيًا مع كل نسخة جديدة تتولّد من القالب ده.</p>
              <div className="subtask-add-row">
                <input
                  ref={itemRef}
                  className="subtask-add-input"
                  value={itemDraft}
                  onChange={(e) => setItemDraft(e.target.value)}
                  placeholder="مثال: مراجعة كشف الحساب"
                  maxLength={200}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItem();
                    }
                  }}
                />
                <button type="button" className="small" onClick={addItem} disabled={!itemDraft.trim()}>
                  <DynamicIcon name="plus" size={14} /> إضافة
                </button>
              </div>
              {items.length === 0 ? (
                <p className="wizard-empty-hint">لسه مفيش مهام فرعية — تقدر تضيفها دلوقتي أو تتخطى الخطوة</p>
              ) : (
                <ul className="subtask-draft-list">
                  {items.map((it, i) => (
                    <li key={i} className="subtask-draft-item">
                      <DynamicIcon name="circle" size={12} />
                      <span>{it.content}</span>
                      <button type="button" className="icon-btn small" onClick={() => removeItem(i)} aria-label="حذف">
                        <DynamicIcon name="x" size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step.id === 'priority' && (
            <div className="add-task-field">
              <span className="add-task-label">الأولوية</span>
              <PriorityPicker value={priority} onChange={setPriority} />
            </div>
          )}

          {step.id === 'frequency' && (
            <div className="add-task-field">
              <span className="add-task-label">دورة التكرار</span>
              <div className="recurring-frequency-row">
                <div className="priority-picker recurring-frequency-picker" role="radiogroup" aria-label="اختيار نمط التكرار">
                  {FREQUENCY_OPTIONS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className={`priority-picker-item ${f.key === frequency ? 'selected' : ''}`}
                      onClick={() => setFrequency(f.key)}
                      role="radio"
                      aria-checked={f.key === frequency}
                    >
                      <DynamicIcon name="repeat" size={13} />
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
                <div className="recurring-interval-field">
                  <span>كل</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={interval}
                    onChange={(e) => setIntervalValue(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                  />
                  <span>{FREQUENCY_OPTIONS.find((f) => f.key === frequency)?.unit}</span>
                </div>
              </div>
              <p className="wizard-empty-hint">
                <DynamicIcon name="sparkles" size={12} /> {intervalDescription(frequency, interval)}
              </p>
            </div>
          )}

          {step.id === 'startDate' && (
            <div className="add-task-field">
              <span className="add-task-label">تاريخ أول تكرار</span>
              <div className="timeline-form-row">
                <label>يبدأ من</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <p className="wizard-empty-hint">
                <DynamicIcon name="calendar" size={12} /> {intervalDescription(frequency, interval)} ابتداءً من التاريخ ده
              </p>
            </div>
          )}

          {step.id === 'lifeArea' && (
            <div className="add-task-field">
              <span className="add-task-label">مجال الحياة (اختياري)</span>
              <LifeAreaPicker value={lifeAreaId} areas={lifeAreas} onChange={setLifeAreaId} onManage={onManageLifeAreas} />
            </div>
          )}

          {step.id === 'review' && (
            <div className="wizard-review">
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="sparkles" size={14} /> الاسم</span>
                <span className="wizard-review-value">{trimmedTitle}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="list-checks" size={14} /> فرعية ثابتة</span>
                <span className="wizard-review-value">{items.length > 0 ? `${items.length} مهمة فرعية` : 'مفيش'}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="flag" size={14} /> الأولوية</span>
                <span className="wizard-review-value">{reviewPriority.label}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="repeat" size={14} /> دورة التكرار</span>
                <span className="wizard-review-value">{intervalDescription(frequency, interval)}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="calendar" size={14} /> أول تكرار</span>
                <span className="wizard-review-value">{startDate}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="compass" size={14} /> مجال الحياة</span>
                <span className="wizard-review-value">{reviewLifeArea ? reviewLifeArea.name : 'مفيش'}</span>
              </div>
            </div>
          )}

          {stepError && (
            <p className="wizard-step-error" role="alert">
              <DynamicIcon name="alert" size={13} /> {stepError}
            </p>
          )}
        </div>

        <div className="add-task-footer">
          <button className="small" type="button" onClick={goBack}>
            {isFirst ? 'إلغاء' : 'رجوع'}
          </button>
          {isLast ? (
            <button className="add-task-submit" type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'جاري الإنشاء…' : 'إنشاء المهمة المتكررة'}
            </button>
          ) : (
            <button className="add-task-submit" type="button" onClick={goNext}>
              التالي
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
