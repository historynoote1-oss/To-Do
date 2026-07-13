import { useEffect, useMemo, useRef, useState } from 'react';
import { PriorityPicker } from './Priority';
import { CategoryPicker } from './Category';
import { LifeAreaPicker } from './LifeArea';
import QuickCreateLifeArea from './QuickCreateLifeArea';
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
  // بيتنادى بمجرد ما مجال حياة جديد يتنشئ من جوه الويزارد (شوف مرحلة
  // "مجال الحياة") — عشان الأب (App) يحدّث قائمة المجالات العامة بتاعته
  // برضه، مش بس النسخة المحلية جوه الويزارد.
  onLifeAreaCreated?: (area: LifeAreaData) => void;
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
  { id: 'timeline', label: 'الجدول الزمني', icon: 'timer' },
  { id: 'reminder', label: 'التذكير', icon: 'bell' },
  { id: 'review', label: 'المراجعة', icon: 'check' },
];

// نافذة إضافة مهمة رئيسية جديدة — بديل النموذج الواحد الطويل. دلوقتي كل
// حاجة على مراحل مرتبة (اسم → فرعية → أولوية → تصنيف → مجال حياة → جدول
// زمني → تذكير → مراجعة)، كل مرحلة في شاشة مستقلة عشان الإدخال على الموبايل
// يفضل مريح ومركّز، وزرار "إنشاء المهمة" مش بيظهر غير بعد آخر مرحلة.
// ملحوظة: خطوة "الجدول الزمني" قبل "التذكير" عن قصد — التذكير بيتحسب من
// وقت بداية المهمة، فلازم يكون معروف قبل ما نعرض خطوة التذكير أصلًا.
export default function AddTaskModal({ open, lifeAreas, onClose, onManageLifeAreas, onCreate, onLifeAreaCreated }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  const [title, setTitle] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [priority, setPriority] = useState<PriorityKey>('MEDIUM');
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [targetYear, setTargetYear] = useState<number | null>(null);
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
      // هيقفل الاتنين مع بعض ويضيع تقدّم المستخدم في إنشاء المهمة.
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

  // فحص صارم لكل مرحلة بالاسم (مش بس المرحلة الحالية) — بيتنادى مرتين:
  // مرة على المرحلة الحالية بس (goNext)، ومرة تانية بتلف على كل المراحل
  // قبل الإنشاء النهائي كخط دفاع تاني، عشان محدش يقدر يوصل لمرحلة
  // المراجعة وبيانات ناقصة أو غير متسقة من غير ما يتوقف عندها.
  function validateStepById(id: StepId): string | null {
    if (id === 'title' && !trimmedTitle) return 'اكتب اسم المهمة الأول';
    if (id === 'subtasks') {
      if (subtaskDraft.trim() && subtasks.every((s) => s !== subtaskDraft.trim())) {
        return 'كتبت مهمة فرعية ولسه مضفتهاش — دوس "إضافة" أو امسح الخانة عشان تكمل';
      }
      if (subtasks.length === 0) {
        return 'لازم تضيف مهمة فرعية واحدة على الأقل';
      }
    }
    if (id === 'category' && !category) {
      return 'لازم تختار تصنيف للمهمة';
    }
    if (id === 'lifeArea' && !lifeAreaId) {
      return 'لازم تختار مجال حياة للمهمة';
    }
    if (id === 'timeline') {
      if (!startDraft || !endDraft) {
        return 'لازم تحدد وقت البداية والنهاية للمهمة';
      }
      if (new Date(endDraft).getTime() <= new Date(startDraft).getTime()) {
        return 'وقت النهاية لازم يكون بعد وقت البداية';
      }
    }
    if (id === 'reminder') {
      if (!hasTimelineStart) {
        return 'حدد وقت بداية المهمة في خطوة "الجدول الزمني" الأول عشان تقدر تضبط التذكير';
      }
      if (!hasReminder) {
        return 'لازم تضبط مدة التذكير قبل بداية المهمة';
      }
      if (!reminderMessage.trim()) {
        return 'اكتب رسالة التذكير';
      }
    }
    return null;
  }

  function validateStep(): string | null {
    return validateStepById(step.id);
  }

  // خط الدفاع الأخير قبل حفظ أي حاجة في قاعدة البيانات — بيلف على كل
  // مراحل الويزارد (مش بس اللي المستخدم واقف عندها دلوقتي) ويرجّع أول
  // خطأ يلاقيه، مع رقم المرحلة عشان نقدر نرجّع المستخدم لها مباشرة.
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
    // يسمح بالرجوع لأي مرحلة سابقة اتخطتها بالفعل بحرية من شريط التقدّم.
    if (index >= stepIndex) return;
    setStepError('');
    setStepIndex(index);
  }

  async function handleSubmit() {
    // خط دفاع أول: المرحلة الحالية بس (نفس سلوك goNext).
    const err = validateStep();
    if (err) {
      setStepError(err);
      sounds.error();
      return;
    }
    // خط دفاع تاني: كل المراحل مع بعض — لو فيه أي حاجة ناقصة أو غير
    // متسقة اتسابت من مرحلة سابقة، مانوصلش نحفظ حاجة ناقصة في قاعدة
    // البيانات؛ بنرجّع المستخدم للمرحلة اللي فيها المشكلة مباشرة.
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
      const startTime = startDraft ? new Date(startDraft).toISOString() : null;
      const endTime = endDraft ? new Date(endDraft).toISOString() : null;
      const reminderMsg = reminderMessage.trim();
      const reminder: NewTaskReminder | null = hasReminder
        ? { offsetMinutes: Math.round(totalReminderMinutes), message: reminderMsg ? reminderMsg : null }
        : null;
      await onCreate({
        title: trimmedTitle,
        subtasks: subtasks.map((s) => s.trim()).filter(Boolean),
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
  const reviewLifeArea = useMemo(
    () => displayLifeAreas.find((a) => a.id === lifeAreaId) || null,
    [displayLifeAreas, lifeAreaId]
  );
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
        aria-labelledby="add-task-title"
      >
        <div className="add-task-header">
          <h2 id="add-task-title">
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
              <span className="add-task-label">المهام الفرعية</span>
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
                <p className="wizard-empty-hint">لسه مفيش مهام فرعية — لازم تضيف مهمة واحدة على الأقل عشان تكمل</p>
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
              <span className="add-task-label">التصنيف</span>
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

          {step.id === 'reminder' && !hasTimelineStart && (
            <div className="add-task-field">
              <span className="add-task-label">إعداد التذكير</span>
              <p className="wizard-empty-hint">
                <DynamicIcon name="timer" size={12} /> التذكير بيتحسب من وقت بداية المهمة — لازم تحدده الأول في خطوة
                "الجدول الزمني" قبل ما تكمل هنا.
              </p>
              <button
                type="button"
                className="small"
                onClick={() => {
                  setStepError('');
                  setStepIndex(STEPS.findIndex((s) => s.id === 'timeline'));
                }}
              >
                <DynamicIcon name="timer" size={14} /> رجوع لتحديد وقت البداية
              </button>
            </div>
          )}

          {step.id === 'reminder' && hasTimelineStart && (
            <div className="add-task-field">
              <span className="add-task-label">إعداد التذكير</span>
              <p className="wizard-empty-hint">
                هيوصلك تنبيه قبل وقت بداية المهمة بالمدة اللي تحددها هنا — اضبط خانة واحدة على الأقل.
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
              {hasReminder && (
                <div className="reminders-offset-preview">
                  <DynamicIcon name="bell" size={12} />
                  قبل بداية المهمة بـ {formatOffsetParts(Number(reminderDays) || 0, Number(reminderHours) || 0, Number(reminderMinutes) || 0)}
                </div>
              )}
              {hasReminder && (
                <input
                  className="reminders-message-input"
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  placeholder="رسالة التذكير"
                  maxLength={200}
                />
              )}
            </div>
          )}

          {step.id === 'timeline' && (
            <div className="add-task-field">
              <span className="add-task-label">الجدول الزمني</span>
              <div className="timeline-form-row">
                <label>وقت البداية</label>
                <input type="datetime-local" value={startDraft} onChange={(e) => setStartDraft(e.target.value)} />
              </div>
              <div className="timeline-form-row">
                <label>وقت النهاية</label>
                <input type="datetime-local" value={endDraft} onChange={(e) => setEndDraft(e.target.value)} />
              </div>
              {startDraft && endDraft && new Date(endDraft).getTime() <= new Date(startDraft).getTime() && (
                <p className="wizard-step-error" role="alert">
                  <DynamicIcon name="alert" size={13} /> وقت النهاية لازم يكون بعد وقت البداية
                </p>
              )}
              {hasReminder && (
                <p className="wizard-empty-hint">
                  <DynamicIcon name="bell" size={12} /> ضبطت تذكير قبل بداية المهمة، فلازم تحدد وقت البداية هنا.
                </p>
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
