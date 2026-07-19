import { useEffect, useMemo, useRef, useState } from 'react';
import { PriorityPicker } from './Priority';
import { LifeAreaPicker } from './LifeArea';
import QuickCreateLifeArea from './QuickCreateLifeArea';
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
  // بيتنادى بمجرد ما مجال حياة جديد يتنشئ من جوه الويزارد (شوف مرحلة
  // "مجال الحياة") — عشان الأب (App) يحدّث قائمة المجالات العامة بتاعته
  // برضه، مش بس النسخة المحلية جوه الويزارد.
  onLifeAreaCreated?: (area: LifeAreaData) => void;
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
export default function AddRecurringTaskModal({ open, lifeAreas, onClose, onManageLifeAreas, onCreate, onLifeAreaCreated }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  const [title, setTitle] = useState('');
  const [items, setItems] = useState<NewRecurringSubtask[]>([]);
  const [itemDraft, setItemDraft] = useState('');
  const [priority, setPriority] = useState<PriorityKey>('MEDIUM');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('DAILY');
  const [interval, setIntervalValue] = useState(1);
  const [startDate, setStartDate] = useState(todayIso());
  const [lifeAreaId, setLifeAreaId] = useState<string | null>(null);
  // مجالات اتنشأت من جوه الويزارد نفسه (شوف QuickCreateLifeArea) — بتتحط
  // فوق قائمة `lifeAreas` الجاية من الأب عشان تبان وتتحدد فورًا، من غير
  // ما نستنى دورة تحديث كاملة من الأب الأول. بمجرد ما الأب يحدّث قائمته
  // (عبر onLifeAreaCreated) هي بتختفي من هنا تلقائيًا (اتفلترت كتكرار).
  const [createdAreas, setCreatedAreas] = useState<LifeAreaData[]>([]);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const displayLifeAreas = useMemo(() => {
    const knownIds = new Set(lifeAreas.map((a) => a.id));
    const extra = createdAreas.filter((a) => !knownIds.has(a.id));
    return extra.length > 0 ? [...lifeAreas, ...extra] : lifeAreas;
  }, [lifeAreas, createdAreas]);

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
      setCreatedAreas([]);
      setQuickCreateOpen(false);
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      // لو نافذة إنشاء مجال الحياة السريعة مفتوحة فوق الويزارد، سيبها هي
      // اللي تتصرف مع Escape (بتقفل هي بس) — من غير كده هروب واحد كان
      // هيقفل الاتنين مع بعض ويضيع تقدّم المستخدم في إنشاء المهمة المتكررة.
      if (quickCreateOpen) return;
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    document.body.classList.add('modal-lock-scroll');
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.classList.remove('modal-lock-scroll');
    };
  }, [open, onClose, quickCreateOpen]);

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

  // فحص صارم لكل مرحلة بالاسم (مش بس المرحلة الحالية) — نفس فلسفة نافذة
  // "إضافة مهمة" العادية بالظبط، بيتنادى مرتين: مرة على المرحلة الحالية
  // بس (goNext)، ومرة تانية بتلف على كل المراحل قبل الإنشاء النهائي كخط
  // دفاع تاني، عشان محدش يقدر يوصل لمرحلة المراجعة وبيانات ناقصة.
  function validateStepById(id: StepId): string | null {
    if (id === 'title' && !trimmedTitle) return 'اكتب اسم المهمة الأول';
    if (id === 'subtasks') {
      if (itemDraft.trim() && items.every((it) => it.content !== itemDraft.trim())) {
        return 'كتبت مهمة فرعية ولسه مضفتهاش — دوس "إضافة" أو امسح الخانة عشان تكمل';
      }
      if (items.length === 0) {
        return 'لازم تضيف مهمة فرعية ثابتة واحدة على الأقل';
      }
    }
    if (id === 'startDate' && !startDate) return 'حدد تاريخ أول تكرار';
    if (id === 'lifeArea' && !lifeAreaId) return 'لازم تختار مجال حياة للمهمة';
    return null;
  }

  function validateStep(): string | null {
    return validateStepById(step.id);
  }

  function validateAllSteps(): { stepIndex: number; message: string } | null {
    for (let i = 0; i < STEPS.length; i++) {
      const err = validateStepById(STEPS[i].id);
      if (err) return { stepIndex: i, message: err };
    }
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
    // خط دفاع تاني: كل المراحل مع بعض — لو فيه أي حاجة ناقصة اتسابت من
    // مرحلة سابقة، مانوصلش نحفظ حاجة ناقصة؛ بنرجّع المستخدم للمرحلة
    // اللي فيها المشكلة مباشرة.
    const fullCheck = validateAllSteps();
    if (fullCheck) {
      setStepIndex(fullCheck.stepIndex);
      setStepError(fullCheck.message);
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

  const reviewLifeArea = useMemo(() => displayLifeAreas.find((a) => a.id === lifeAreaId) || null, [displayLifeAreas, lifeAreaId]);
  const reviewPriority = useMemo(() => priorityOf(priority), [priority]);

  if (!open) return null;

  return (
    <>
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
            <span className="add-task-header-icon" aria-hidden="true">
              <DynamicIcon name={step.icon} size={20} strokeWidth={2.25} />
            </span>
            <span className="add-task-header-text">
              <span className="add-task-header-step">الخطوة {stepIndex + 1} من {STEPS.length}</span>
              <span className="add-task-header-title">{step.label}</span>
            </span>
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
              <span className="add-task-label">المهام الفرعية الثابتة</span>
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
                <p className="wizard-empty-hint">لسه مفيش مهام فرعية — لازم تضيف مهمة واحدة على الأقل عشان تكمل</p>
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
              <span className="add-task-label">مجال الحياة</span>
              <LifeAreaPicker
                value={lifeAreaId}
                areas={displayLifeAreas}
                onChange={setLifeAreaId}
                onManage={() => setQuickCreateOpen(true)}
              />
              {displayLifeAreas.length > 0 && (
                <button type="button" className="life-area-manage-all-link" onClick={onManageLifeAreas}>
                  إدارة كل المجالات
                </button>
              )}
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

    <QuickCreateLifeArea
      open={quickCreateOpen}
      onClose={() => setQuickCreateOpen(false)}
      onCreated={(area) => {
        setCreatedAreas((prev) => [...prev, area]);
        setLifeAreaId(area.id);
        onLifeAreaCreated?.(area);
      }}
    />
    </>
  );
}
