import { useEffect, useMemo, useRef, useState } from 'react';
import { PriorityPicker } from './Priority';
import { CategoryPicker } from './Category';
import { LifeAreaPicker } from './LifeArea';
import { PriorityKey, priorityOf } from '../lib/priority';
import { CategoryKey, categoryOf } from '../lib/category';
import { LifeAreaData } from '../lib/lifeArea';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';

export interface NewTaskReminder {
  offsetMinutes: number;
  message: string | null;
}

export interface NewTaskPayload {
  title: string;
  subtasks: string[];
  priority: PriorityKey;
  category: CategoryKey | null;
  targetYear: number | null;
  lifeAreaId: string | null;
  startTime: string | null;
  endTime: string | null;
  reminder: NewTaskReminder | null;
}

interface Props {
  open: boolean;
  lifeAreas: LifeAreaData[];
  onClose: () => void;
  onManageLifeAreas: () => void;
  onCreate: (data: NewTaskPayload) => Promise<void> | void;
}

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatOffsetParts(days: number, hours: number, minutes: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(days === 1 ? 'يوم' : days === 2 ? 'يومين' : `${days} أيام`);
  if (hours > 0) parts.push(hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : `${hours} ساعات`);
  if (minutes > 0) parts.push(minutes === 1 ? 'دقيقة' : minutes === 2 ? 'دقيقتين' : `${minutes} دقيقة`);
  return parts.join(' و');
}

type StepId = 'title' | 'subtasks' | 'priority' | 'category' | 'lifeArea' | 'reminder' | 'timeline' | 'review';

interface StepDef {
  id: StepId;
  label: string;
  icon: string;
}

const STEPS: StepDef[] = [
  { id: 'title', label: 'اسم المهمة', icon: 'sparkles' },
  { id: 'subtasks', label: 'المهام الفرعية', icon: 'list-checks' },
  { id: 'priority', label: 'الأولوية', icon: 'flag' },
  { id: 'category', label: 'التصنيف', icon: 'tag' },
  { id: 'lifeArea', label: 'مجال الحياة', icon: 'compass' },
  { id: 'reminder', label: 'التذكير', icon: 'bell' },
  { id: 'timeline', label: 'الجدول الزمني', icon: 'timer' },
  { id: 'review', label: 'المراجعة', icon: 'check' },
];

// نافذة إضافة مهمة رئيسية جديدة — بديل النموذج الواحد الطويل. دلوقتي كل
// حاجة على مراحل مرتبة (اسم → فرعية → أولوية → تصنيف → مجال حياة → تذكير →
// جدول زمني → مراجعة)، كل مرحلة في شاشة مستقلة عشان الإدخال على الموبايل
// يفضل مريح ومركّز، وزرار "إنشاء المهمة" مش بيظهر غير بعد آخر مرحلة.
export default function AddTaskModal({ open, lifeAreas, onClose, onManageLifeAreas, onCreate }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  const [title, setTitle] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [priority, setPriority] = useState<PriorityKey>('MEDIUM');
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [targetYear, setTargetYear] = useState<number | null>(null);
  const [lifeAreaId, setLifeAreaId] = useState<string | null>(null);

  // التذكير الجديد: ثلاث خانات مستقلة (أيام / ساعات / دقايق) — الرقم
  // المُدخل بيدل على المدة قبل موعد بداية المهمة (الجدول الزمني بتاعها).
  const [reminderDays, setReminderDays] = useState('');
  const [reminderHours, setReminderHours] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');

  const [startDraft, setStartDraft] = useState('');
  const [endDraft, setEndDraft] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const subtaskRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setTitle('');
      setSubtasks([]);
      setSubtaskDraft('');
      setPriority('MEDIUM');
      setCategory(null);
      setTargetYear(null);
      setLifeAreaId(null);
      setReminderDays('');
      setReminderHours('');
      setReminderMinutes('');
      setReminderMessage('');
      setStartDraft('');
      setEndDraft('');
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

  const totalReminderMinutes =
    (Number(reminderDays) || 0) * 60 * 24 + (Number(reminderHours) || 0) * 60 + (Number(reminderMinutes) || 0);
  const hasReminder = totalReminderMinutes > 0;
  const hasTimelineStart = startDraft.trim().length > 0;

  const trimmedTitle = title.trim();

  function addSubtask() {
    const value = subtaskDraft.trim();
    if (!value) return;
    setSubtasks((prev) => [...prev, value]);
    setSubtaskDraft('');
    sounds.hover();
    requestAnimationFrame(() => subtaskRef.current?.focus());
  }

  function removeSubtask(index: number) {
    setSubtasks((prev) => prev.filter((_, i) => i !== index));
  }

  // فحص كل مرحلة قبل السماح بالتقدّم للي بعدها — رسالة خطأ واضحة مكان
  // زرار "التالي" بدل ما نمنعه بصمت.
  function validateStep(): string | null {
    if (step.id === 'title' && !trimmedTitle) return 'اكتب اسم المهمة الأول';
    if (step.id === 'reminder' && hasReminder && !hasTimelineStart) {
      return 'التذكير محسوب من وقت بداية الجدول الزمني — حدده في الخطوة الجاية';
    }
    if (step.id === 'timeline' && hasReminder && !startDraft.trim()) {
      return 'حدد وقت بداية للمهمة عشان يتحسب عليه التذكير اللي ضبطته';
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
    // يسمح بالرجوع لأي مرحلة سابقة اتخطتها بالفعل بحرية من شريط التقدّم.
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
      const startTime = startDraft ? new Date(startDraft).toISOString() : null;
      const endTime = endDraft ? new Date(endDraft).toISOString() : null;
      const reminder: NewTaskReminder | null = hasReminder
        ? { offsetMinutes: Math.round(totalReminderMinutes), message: reminderMessage.trim() || null }
        : null;
      await onCreate({
        title: trimmedTitle,
        subtasks,
        priority,
        category,
        targetYear,
        lifeAreaId,
        startTime,
        endTime,
        reminder,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const reviewCategory = useMemo(() => categoryOf(category), [category]);
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
        aria-labelledby="add-task-title"
      >
        <div className="add-task-header">
          <h2 id="add-task-title">
            <DynamicIcon name={step.icon} size={18} /> {step.label}
          </h2>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="إغلاق">
            <DynamicIcon name="x" size={16} />
          </button>
        </div>

        <div className="wizard-steps" role="tablist" aria-label="مراحل إنشاء المهمة">
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
              <label htmlFor="add-task-input" className="add-task-label">
                اسم المهمة
              </label>
              <input
                id="add-task-input"
                ref={titleRef}
                className="add-task-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: تجهيز عرض المشروع"
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
              <span className="add-task-label">المهام الفرعية (اختياري)</span>
              <div className="subtask-add-row">
                <input
                  ref={subtaskRef}
                  className="subtask-add-input"
                  value={subtaskDraft}
                  onChange={(e) => setSubtaskDraft(e.target.value)}
                  placeholder="مثال: تجهيز الشرائح"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                />
                <button type="button" className="small" onClick={addSubtask} disabled={!subtaskDraft.trim()}>
                  <DynamicIcon name="plus" size={14} /> إضافة
                </button>
              </div>
              {subtasks.length === 0 ? (
                <p className="wizard-empty-hint">لسه مفيش مهام فرعية — تقدر تضيفها دلوقتي أو تتخطى الخطوة</p>
              ) : (
                <ul className="subtask-draft-list">
                  {subtasks.map((s, i) => (
                    <li key={i} className="subtask-draft-item">
                      <DynamicIcon name="circle" size={12} />
                      <span>{s}</span>
                      <button type="button" className="icon-btn small" onClick={() => removeSubtask(i)} aria-label="حذف">
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

          {step.id === 'category' && (
            <div className="add-task-field">
              <span className="add-task-label">التصنيف (اختياري)</span>
              <CategoryPicker
                value={category}
                targetYear={targetYear}
                onChange={(key, year) => {
                  setCategory(key);
                  setTargetYear(key === 'YEARLY' ? year ?? new Date().getFullYear() : null);
                }}
              />
            </div>
          )}

          {step.id === 'lifeArea' && (
            <div className="add-task-field">
              <span className="add-task-label">مجال الحياة (اختياري)</span>
              <LifeAreaPicker value={lifeAreaId} areas={lifeAreas} onChange={setLifeAreaId} onManage={onManageLifeAreas} />
            </div>
          )}

          {step.id === 'reminder' && (
            <div className="add-task-field">
              <span className="add-task-label">إعداد التذكير (اختياري)</span>
              <p className="wizard-empty-hint">
                هيوصلك تنبيه قبل وقت بداية المهمة بالمدة اللي تحددها هنا — اضبط أي خانة أو أكتر.
              </p>
              <div className="reminders-offset-fields">
                <label className="reminders-offset-field">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={reminderDays}
                    onChange={(e) => setReminderDays(e.target.value.replace(/[^0-9]/g, ''))}
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
                    value={reminderHours}
                    onChange={(e) => setReminderHours(e.target.value.replace(/[^0-9]/g, ''))}
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
                    value={reminderMinutes}
                    onChange={(e) => setReminderMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                    aria-label="عدد الدقايق"
                  />
                  <span>دقيقة</span>
                </label>
              </div>
              <div className="reminders-offset-preview">
                {hasReminder ? (
                  <>
                    <DynamicIcon name="bell" size={12} />
                    قبل بداية المهمة بـ {formatOffsetParts(Number(reminderDays) || 0, Number(reminderHours) || 0, Number(reminderMinutes) || 0)}
                  </>
                ) : (
                  'من غير تذكير — سيب الخانات فاضية لو مش محتاج'
                )}
              </div>
              {hasReminder && (
                <input
                  className="reminders-message-input"
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  placeholder="رسالة التذكير (اختياري)"
                  maxLength={200}
                />
              )}
            </div>
          )}

          {step.id === 'timeline' && (
            <div className="add-task-field">
              <span className="add-task-label">الجدول الزمني (اختياري)</span>
              <div className="timeline-form-row">
                <label>وقت البداية</label>
                <input type="datetime-local" value={startDraft} onChange={(e) => setStartDraft(e.target.value)} />
              </div>
              <div className="timeline-form-row">
                <label>وقت النهاية</label>
                <input type="datetime-local" value={endDraft} onChange={(e) => setEndDraft(e.target.value)} />
              </div>
              {hasReminder && (
                <p className="wizard-empty-hint">
                  <DynamicIcon name="bell" size={12} /> ضبطت تذكير قبل بداية المهمة، فلازم تحدد وقت البداية هنا.
                </p>
              )}
              {!startDraft && (
                <button
                  type="button"
                  className="small"
                  onClick={() => {
                    setStartDraft(toDatetimeLocalValue(new Date(Date.now() + 5 * 60 * 1000)));
                    setEndDraft(toDatetimeLocalValue(new Date(Date.now() + 65 * 60 * 1000)));
                  }}
                >
                  <DynamicIcon name="timer" size={14} /> اقتراح سريع (خلال ساعة)
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
                <span className="wizard-review-label"><DynamicIcon name="list-checks" size={14} /> فرعية</span>
                <span className="wizard-review-value">{subtasks.length > 0 ? `${subtasks.length} مهمة فرعية` : 'مفيش'}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="flag" size={14} /> الأولوية</span>
                <span className="wizard-review-value">{reviewPriority.label}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="tag" size={14} /> التصنيف</span>
                <span className="wizard-review-value">{reviewCategory ? reviewCategory.label : 'مفيش'}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="compass" size={14} /> مجال الحياة</span>
                <span className="wizard-review-value">{reviewLifeArea ? reviewLifeArea.name : 'مفيش'}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="bell" size={14} /> التذكير</span>
                <span className="wizard-review-value">
                  {hasReminder
                    ? `قبل البداية بـ ${formatOffsetParts(Number(reminderDays) || 0, Number(reminderHours) || 0, Number(reminderMinutes) || 0)}`
                    : 'مفيش'}
                </span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="timer" size={14} /> الجدول الزمني</span>
                <span className="wizard-review-value">
                  {startDraft ? new Date(startDraft).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : 'مفيش'}
                </span>
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
              {submitting ? 'جاري الإنشاء…' : 'إنشاء المهمة'}
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
