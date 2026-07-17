import { useEffect, useMemo, useRef, useState } from 'react';
import { PriorityPicker } from './Priority';
import { CategoryPicker } from './Category';
import { LifeAreaPicker } from './LifeArea';
import QuickCreateLifeArea from './QuickCreateLifeArea';
import { PriorityKey, priorityOf } from '../lib/priority';
import { CategoryKey, categoryOf, requiresParentGoal, goalLabelFor, CHILD_CATEGORY_OF, PARENT_CATEGORY_OF } from '../lib/category';
import { LifeAreaData } from '../lib/lifeArea';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';
import { getGoalOptions, GoalOption } from '../lib/api';
import Portal from './Portal';
import ConfirmModal from './ConfirmModal';

export interface NewTaskReminder {
  // id فعلي لو التذكير ده كان موجود قبل كده وبيتعدّل، أو null لو تذكير
  // جديد لسه ملوش وجود في قاعدة البيانات.
  id?: string | null;
  offsetMinutes: number;
  message: string | null;
}

// مهمة فرعية داخل الويزارد — id فعلي لو موجودة أصلًا وبتتعدّل، أو null لو
// مهمة فرعية جديدة لسه هتتنشئ عند الحفظ.
export interface SubtaskDraft {
  id: string | null;
  content: string;
}

export interface NewTaskPayload {
  title: string;
  subtasks: SubtaskDraft[];
  // ids للمهام الفرعية اللي كانت موجودة وانمسحت من جوه الويزارد أثناء التعديل.
  deletedSubtaskIds: string[];
  priority: PriorityKey;
  category: CategoryKey | null;
  targetYear: number | null;
  lifeAreaId: string | null;
  // ===== خريطة الأهداف الهرمية =====
  // ID الهدف الأب المباشر (سنوي/شهري/أسبوعي حسب تصنيف المهمة دي) — null لو
  // مش مربوطة بأي هدف أعلى. شوف lib/category.ts (PARENT_CATEGORY_OF).
  parentGoalId: string | null;
  startTime: string | null;
  endTime: string | null;
  reminders: NewTaskReminder[];
  // ids للتذكيرات اللي كانت موجودة وانمسحت من جوه الويزارد أثناء التعديل.
  deletedReminderIds: string[];
}

export interface EditTaskTarget {
  id: string;
  title: string;
  priority: PriorityKey;
  category: CategoryKey | null;
  targetYear: number | null;
  lifeAreaId: string | null;
  parentGoalId: string | null;
  startTime: string | null;
  endTime: string | null;
  // المهام الفرعية والتذكيرات الحالية للمهمة — لازم تتبعت عشان الويزارد
  // يبدأ بيها معمورة في وضع التعديل، مش فاضية، فيقدر المستخدم يعدّل
  // عليها أو يمسحها أو يرتبها من غير ما يفقدها.
  subtasks?: { id: string; content: string }[];
  reminders?: { id: string; offsetMinutes: number; message: string | null }[];
}

interface Props {
  open: boolean;
  lifeAreas: LifeAreaData[];
  onClose: () => void;
  onManageLifeAreas: () => void;
  onCreate?: (data: NewTaskPayload) => Promise<void> | void;
  // بيتنادى بمجرد ما مجال حياة جديد يتنشئ من جوه الويزارد (شوف مرحلة
  // "مجال الحياة") — عشان الأب (App) يحدّث قائمة المجالات العامة بتاعته
  // برضه، مش بس النسخة المحلية جوه الويزارد.
  onLifeAreaCreated?: (area: LifeAreaData) => void;
  // لو اتبعتت، النافذة بتفتح في وضع "تعديل مهمة موجودة" بدل "إنشاء مهمة
  // جديدة" — بتتخطى خطوة المهام الفرعية (مالهاش معنى في التعديل)، بتبدأ
  // بقيم المهمة الحالية، وبتنادي onSave بدل onCreate عند الحفظ.
  editTarget?: EditTaskTarget | null;
  onSave?: (id: string, data: NewTaskPayload) => Promise<void> | void;
  // ===== إضافة هدف فرعي مباشرة من كارت هدف =====
  // لو اتبعتوا (ومفيش editTarget)، النافذة بتفتح جاهزة على تصنيف الهدف
  // الفرعي المناسب (مثلاً شهري لو presetParentGoal سنوي) ومربوطة بيه
  // تلقائيًا من غير ما المستخدم يمر بخطوة اختيار التصنيف/الهدف الأب يدوي.
  presetParentGoal?: GoalOption | null;
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

function formatOffsetFromMinutes(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return formatOffsetParts(days, hours, minutes);
}

type StepId = 'title' | 'subtasks' | 'priority' | 'category' | 'goal' | 'lifeArea' | 'reminder' | 'timeline' | 'review';

interface StepDef {
  id: StepId;
  label: string;
  icon: string;
}

const ALL_STEPS: StepDef[] = [
  { id: 'title', label: 'اسم المهمة', icon: 'sparkles' },
  { id: 'subtasks', label: 'المهام الفرعية', icon: 'list-checks' },
  { id: 'priority', label: 'الأولوية', icon: 'flag' },
  { id: 'category', label: 'التصنيف', icon: 'tag' },
  // بتظهر بس للتصنيفات المحتاجة "هدف أب" (شهري/أسبوعي/يومي) — شوف فلترة
  // STEPS جوه الكومبوننت. عن قصد بعد "التصنيف" مباشرة عشان نعرف الأول
  // التصنيف قبل ما نجيب خيارات الأب المناسبة له.
  { id: 'goal', label: 'الهدف الأب', icon: 'route' },
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
export default function AddTaskModal({
  open,
  lifeAreas,
  onClose,
  onManageLifeAreas,
  onCreate,
  onLifeAreaCreated,
  editTarget = null,
  onSave,
  presetParentGoal = null,
}: Props) {
  const isEditing = !!editTarget;
  const [stepIndex, setStepIndex] = useState(0);

  const [title, setTitle] = useState('');
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  // ids للمهام الفرعية اللي كانت موجودة أصلًا واتشالت من جوه الويزارد —
  // بتتبعت مع الحفظ عشان تتمسح فعليًا من قاعدة البيانات.
  const [deletedSubtaskIds, setDeletedSubtaskIds] = useState<string[]>([]);
  // فهرس المهمة الفرعية (الموجودة أصلًا) اللي المستخدم دوس على حذفها —
  // بيفتح نافذة تأكيد قبل ما تتشال فعليًا من المسودة. المهام الفرعية
  // الجديدة (لسه متضافتش في قاعدة البيانات) بتتشال على طول من غير تأكيد.
  const [pendingDeleteSubtaskIndex, setPendingDeleteSubtaskIndex] = useState<number | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [priority, setPriority] = useState<PriorityKey>('MEDIUM');
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [targetYear, setTargetYear] = useState<number | null>(null);
  const [lifeAreaId, setLifeAreaId] = useState<string | null>(null);
  // ===== خريطة الأهداف الهرمية =====
  // parentGoalId: الهدف الأب المختار حاليًا (أو null لو المستخدم مش عاوز
  // يربط، أو التصنيف الحالي مالوش أب أصلًا زي السنوي). parentGoalOptions:
  // الأهداف المرشحة تتربط كأب للتصنيف الحالي، بتتجاب من السيرفر كل ما
  // التصنيف يتغيّر لحاجة محتاجة أب.
  const [parentGoalId, setParentGoalId] = useState<string | null>(null);
  const [parentGoalOptions, setParentGoalOptions] = useState<GoalOption[]>([]);
  const [parentGoalOptionsLoading, setParentGoalOptionsLoading] = useState(false);
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

  // التذكير الجديد: ثلاث خانات مستقلة (أيام / ساعات / دقايق) بتمثّل مسودة
  // التذكير اللي بيتم تجهيزه دلوقتي — بعد الضغط على "إضافة تذكير" بينضاف
  // لقايمة `reminders` وبتتصفّر المسودة عشان يقدر المستخدم يضيف تذكير
  // تاني كمان. مفيش حد أقصى لعدد التذكيرات اللي ممكن تتضاف للمهمة.
  const [reminderDays, setReminderDays] = useState('');
  const [reminderHours, setReminderHours] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminders, setReminders] = useState<NewTaskReminder[]>([]);
  // ids للتذكيرات اللي كانت موجودة أصلًا واتشالت من جوه الويزارد.
  const [deletedReminderIds, setDeletedReminderIds] = useState<string[]>([]);
  // فهرس التذكير (الموجود أصلًا) اللي المستخدم دوس على حذفه — بيفتح نافذة
  // تأكيد قبل ما يتشال فعليًا. التذكيرات الجديدة بتتشال على طول من غير تأكيد.
  const [pendingDeleteReminderIndex, setPendingDeleteReminderIndex] = useState<number | null>(null);

  const [startDraft, setStartDraft] = useState('');
  const [endDraft, setEndDraft] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const subtaskRef = useRef<HTMLInputElement>(null);
  const reminderMessageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
      if (editTarget) {
        setTitle(editTarget.title);
        setPriority(editTarget.priority);
        setCategory(editTarget.category);
        setTargetYear(editTarget.targetYear);
        setLifeAreaId(editTarget.lifeAreaId);
        setParentGoalId(editTarget.parentGoalId ?? null);
        setStartDraft(editTarget.startTime ? toDatetimeLocalValue(new Date(editTarget.startTime)) : '');
        setEndDraft(editTarget.endTime ? toDatetimeLocalValue(new Date(editTarget.endTime)) : '');
        setSubtasks((editTarget.subtasks || []).map((s) => ({ id: s.id, content: s.content })));
        setReminders(
          (editTarget.reminders || []).map((r) => ({ id: r.id, offsetMinutes: r.offsetMinutes, message: r.message }))
        );
      } else {
        setTitle('');
        setPriority('MEDIUM');
        // إضافة هدف فرعي من كارت هدف موجود: بنبدأ بتصنيف "الابن" المناسب
        // ومربوطين بيه تلقائيًا، بدل ما المستخدم يمر بالخطوتين يدوي.
        setCategory(presetParentGoal ? (CHILD_CATEGORY_OF[(presetParentGoal.category as CategoryKey) || 'YEARLY'] ?? null) : null);
        setTargetYear(null);
        setLifeAreaId(null);
        setParentGoalId(presetParentGoal ? presetParentGoal.id : null);
        setStartDraft('');
        setEndDraft('');
        setSubtasks([]);
        setReminders([]);
      }
      setDeletedSubtaskIds([]);
      setPendingDeleteSubtaskIndex(null);
      setDeletedReminderIds([]);
      setPendingDeleteReminderIndex(null);
      setSubtaskDraft('');
      setReminderDays('');
      setReminderHours('');
      setReminderMinutes('');
      setReminderMessage('');
      setSubmitting(false);
      setStepError('');
      setCreatedAreas([]);
      setQuickCreateOpen(false);
      requestAnimationFrame(() => titleRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTarget?.id, presetParentGoal?.id]);

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

  // ===== خريطة الأهداف الهرمية =====
  // كل ما التصنيف يتغيّر لحاجة محتاجة "هدف أب" (شهري/أسبوعي/يومي)، بنجيب
  // الأهداف المرشحة من التصنيف الأعلى مباشرة من السيرفر. لو الهدف المختار
  // حاليًا مش موجود ضمن الخيارات الجديدة (اتغيّر التصنيف مثلاً)، بنمسحه.
  useEffect(() => {
    if (!open) return;
    if (!requiresParentGoal(category)) {
      setParentGoalOptions([]);
      return;
    }
    let cancelled = false;
    setParentGoalOptionsLoading(true);
    getGoalOptions(category as string, editTarget?.id)
      .then((options) => {
        if (cancelled) return;
        setParentGoalOptions(options);
        setParentGoalId((current) => (current && !options.some((o) => o.id === current) ? null : current));
      })
      .catch(() => {
        if (!cancelled) setParentGoalOptions([]);
      })
      .finally(() => {
        if (!cancelled) setParentGoalOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, category, editTarget?.id]);

  // خطوة "الهدف الأب" بتظهر بس لو التصنيف الحالي محتاج أب في الهرم — مفيش
  // معنى ليها مع السنوي (قمة الهرم) أو من غير تصنيف أصلًا.
  const STEPS = useMemo(() => {
    if (!requiresParentGoal(category)) return ALL_STEPS.filter((s) => s.id !== 'goal');
    return ALL_STEPS;
  }, [category]);

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
    setSubtasks((prev) => [...prev, { id: null, content: value }]);
    setSubtaskDraft('');
    sounds.hover();
    requestAnimationFrame(() => subtaskRef.current?.focus());
  }

  // لو المهمة الفرعية دي موجودة أصلًا في قاعدة البيانات (ليها id)، بنطلب
  // تأكيد قبل ما نشيلها؛ لو لسه مسودة جديدة (id = null) بنشيلها على طول
  // من غير تأكيد، لأنها أصلًا مش محفوظة في أي مكان.
  function removeSubtask(index: number) {
    const target = subtasks[index];
    if (target?.id) {
      setPendingDeleteSubtaskIndex(index);
      return;
    }
    setSubtasks((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmDeleteSubtask() {
    setSubtasks((prev) => {
      if (pendingDeleteSubtaskIndex === null) return prev;
      const target = prev[pendingDeleteSubtaskIndex];
      if (target?.id) {
        setDeletedSubtaskIds((ids) => [...ids, target.id as string]);
      }
      return prev.filter((_, i) => i !== pendingDeleteSubtaskIndex);
    });
    sounds.deleteItem();
    setPendingDeleteSubtaskIndex(null);
  }

  // بيبدّل مكان مهمة فرعية مع اللي قبلها أو بعدها — عشان يقدر المستخدم
  // يرتب الخطوات بالترتيب اللي هيمشي عليه فعليًا لإنجاز المهمة الرئيسية.
  function moveSubtask(index: number, direction: -1 | 1) {
    const target = index + direction;
    setSubtasks((prev) => {
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // بيضيف مسودة التذكير الحالية (المدة + الرسالة) لقايمة التذكيرات، وبعدين
  // بيصفّر الخانات عشان المستخدم يقدر يجهّز تذكير تاني على طول من غير ما
  // يقفل الخطوة. مفيش حد أقصى لعدد التذكيرات.
  function addReminder() {
    if (!hasReminder) return;
    const msg = reminderMessage.trim();
    if (!msg) return;
    setReminders((prev) => [...prev, { id: null, offsetMinutes: Math.round(totalReminderMinutes), message: msg }]);
    setReminderDays('');
    setReminderHours('');
    setReminderMinutes('');
    setReminderMessage('');
    sounds.hover();
    requestAnimationFrame(() => reminderMessageRef.current?.focus());
  }

  // زي removeSubtask بالظبط — تذكير موجود أصلًا (ليه id) بيطلب تأكيد قبل
  // الحذف، وتذكير جديد لسه مسودة بيتشال على طول.
  function removeReminder(index: number) {
    const target = reminders[index];
    if (target?.id) {
      setPendingDeleteReminderIndex(index);
      return;
    }
    setReminders((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmDeleteReminder() {
    setReminders((prev) => {
      if (pendingDeleteReminderIndex === null) return prev;
      const target = prev[pendingDeleteReminderIndex];
      if (target?.id) {
        setDeletedReminderIds((ids) => [...ids, target.id as string]);
      }
      return prev.filter((_, i) => i !== pendingDeleteReminderIndex);
    });
    sounds.deleteItem();
    setPendingDeleteReminderIndex(null);
  }

  // فحص صارم لكل مرحلة بالاسم (مش بس المرحلة الحالية) — بيتنادى مرتين:
  // مرة على المرحلة الحالية بس (goNext)، ومرة تانية بتلف على كل المراحل
  // قبل الإنشاء النهائي كخط دفاع تاني، عشان محدش يقدر يوصل لمرحلة
  // المراجعة وبيانات ناقصة أو غير متسقة من غير ما يتوقف عندها.
  function validateStepById(id: StepId): string | null {
    if (id === 'title' && !trimmedTitle) return 'اكتب اسم المهمة الأول';
    if (id === 'subtasks') {
      if (subtaskDraft.trim() && subtasks.every((s) => s.content !== subtaskDraft.trim())) {
        return 'كتبت مهمة فرعية ولسه مضفتهاش — دوس "إضافة" أو امسح الخانة عشان تكمل';
      }
      if (!isEditing && subtasks.length === 0) {
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
        return 'حدد وقت بداية المهمة في خطوة "الجدول الزمني" الأول عشان تقدر تضبط التذكيرات';
      }
      if (hasReminder && reminderMessage.trim()) {
        return 'عندك تذكير جاهز ولسه مضفتهوش — دوس "إضافة تذكير" أو امسح الخانات عشان تكمل';
      }
      if (hasReminder !== !!reminderMessage.trim()) {
        return 'كمّل بيانات التذكير (المدة والرسالة) قبل ما تضيفه، أو امسح الخانات';
      }
      if (!isEditing && reminders.length === 0) {
        return 'لازم تضيف تذكير واحد على الأقل';
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
      const payload: NewTaskPayload = {
        title: trimmedTitle,
        subtasks: subtasks
          .map((s) => ({ id: s.id, content: s.content.trim() }))
          .filter((s) => s.content.length > 0),
        deletedSubtaskIds,
        priority,
        category,
        targetYear,
        lifeAreaId,
        parentGoalId: requiresParentGoal(category) ? parentGoalId : null,
        startTime,
        endTime,
        reminders,
        deletedReminderIds,
      };
      if (isEditing && editTarget) {
        await onSave?.(editTarget.id, payload);
      } else {
        await onCreate?.(payload);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const reviewCategory = useMemo(() => categoryOf(category), [category]);
  const reviewParentGoal = useMemo(
    () => (requiresParentGoal(category) ? parentGoalOptions.find((o) => o.id === parentGoalId) || null : null),
    [category, parentGoalId, parentGoalOptions]
  );
  const reviewLifeArea = useMemo(
    () => displayLifeAreas.find((a) => a.id === lifeAreaId) || null,
    [displayLifeAreas, lifeAreaId]
  );
  const reviewPriority = useMemo(() => priorityOf(priority), [priority]);

  if (!open) return null;

  return (
    <Portal>
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

        <div className="wizard-steps" role="tablist" aria-label={isEditing ? 'مراحل تعديل المهمة' : 'مراحل إنشاء المهمة'}>
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
                <p className="wizard-empty-hint">
                  {isEditing
                    ? 'مفيش مهام فرعية دلوقتي — ضيف مهمة جديدة لو حابب، أو كمّل من غير ما تضيف حاجة'
                    : 'لسه مفيش مهام فرعية — لازم تضيف مهمة واحدة على الأقل عشان تكمل'}
                </p>
              ) : (
                <ul className="subtask-draft-list">
                  {subtasks.map((s, i) => (
                    <li key={s.id ?? `new-${i}`} className="subtask-draft-item">
                      <span className="subtask-draft-order" aria-hidden="true">{i + 1}.</span>
                      <input
                        className="subtask-draft-edit-input"
                        value={s.content}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSubtasks((prev) => prev.map((item, idx) => (idx === i ? { ...item, content: value } : item)));
                        }}
                        aria-label="تعديل نص المهمة الفرعية"
                      />
                      <div className="subtask-draft-move">
                        <button
                          type="button"
                          className="icon-btn small"
                          onClick={() => moveSubtask(i, -1)}
                          disabled={i === 0}
                          aria-label="تحريك لأعلى"
                        >
                          <DynamicIcon name="chevron-up" size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn small"
                          onClick={() => moveSubtask(i, 1)}
                          disabled={i === subtasks.length - 1}
                          aria-label="تحريك لأسفل"
                        >
                          <DynamicIcon name="chevron-down" size={13} />
                        </button>
                      </div>
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

          {step.id === 'goal' && (
            <div className="add-task-field">
              <span className="add-task-label">{goalLabelFor(category)} الأب</span>
              <p className="wizard-empty-hint">
                <DynamicIcon name="route" size={12} /> اربط الهدف ده بهدف أعلى منه في الهرم عشان يتحسب ضمن تقدّمه —
                الربط اختياري، تقدر تكمّله بعدين من تعديل المهمة.
              </p>

              {parentGoalOptionsLoading ? (
                <p className="wizard-empty-hint">جاري تحميل الأهداف المتاحة…</p>
              ) : parentGoalOptions.length === 0 ? (
                <p className="wizard-empty-hint">
                  لسه معملتش أي {goalLabelFor(category ? PARENT_CATEGORY_OF[category] : null)} — تقدر تكمّل من غير
                  ربط دلوقتي وتربطه بعدين لما تعمل واحد.
                </p>
              ) : (
                <ul className="goal-parent-option-list">
                  <li>
                    <button
                      type="button"
                      className={`goal-parent-option ${parentGoalId === null ? 'selected' : ''}`}
                      onClick={() => {
                        sounds.hover();
                        setParentGoalId(null);
                      }}
                    >
                      <span className="goal-parent-option-icon">
                        <DynamicIcon name="unlink" size={14} />
                      </span>
                      <span className="goal-parent-option-text">بدون ربط</span>
                      {parentGoalId === null && (
                        <span className="priority-check">
                          <DynamicIcon name="check" size={14} />
                        </span>
                      )}
                    </button>
                  </li>
                  {parentGoalOptions.map((opt) => (
                    <li key={opt.id}>
                      <button
                        type="button"
                        className={`goal-parent-option ${parentGoalId === opt.id ? 'selected' : ''}`}
                        onClick={() => {
                          sounds.hover();
                          setParentGoalId(opt.id);
                        }}
                      >
                        <span className="goal-parent-option-icon">
                          <DynamicIcon name={categoryOf(opt.category)?.icon || 'trophy'} size={14} />
                        </span>
                        <span className="goal-parent-option-text">
                          {opt.title}
                          {opt.targetYear ? <span className="goal-parent-option-year" dir="ltr"> · {opt.targetYear}</span> : null}
                        </span>
                        {parentGoalId === opt.id && (
                          <span className="priority-check">
                            <DynamicIcon name="check" size={14} />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
              <span className="add-task-label">إعداد التذكيرات</span>
              <p className="wizard-empty-hint">
                <DynamicIcon name="timer" size={12} /> التذكيرات بتتحسب من وقت بداية المهمة — لازم تحدده الأول في خطوة
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
              <span className="add-task-label">إعداد التذكيرات</span>
              <p className="wizard-empty-hint">
                هيوصلك تنبيه قبل وقت بداية المهمة بالمدة اللي تحددها هنا — تقدر تضيف أكتر من تذكير.
              </p>

              {reminders.length > 0 && (
                <ul className="reminder-draft-list">
                  {reminders.map((r, i) => (
                    <li key={r.id ?? `new-${i}`} className="reminder-draft-item">
                      <DynamicIcon name="bell" size={12} />
                      <span>
                        قبل البداية بـ {formatOffsetFromMinutes(r.offsetMinutes)}
                        {r.message ? ` — ${r.message}` : ''}
                      </span>
                      <button type="button" className="icon-btn small" onClick={() => removeReminder(i)} aria-label="حذف التذكير">
                        <DynamicIcon name="x" size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

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
                <div className="subtask-add-row">
                  <input
                    ref={reminderMessageRef}
                    className="reminders-message-input"
                    value={reminderMessage}
                    onChange={(e) => setReminderMessage(e.target.value)}
                    placeholder="رسالة التذكير"
                    maxLength={200}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addReminder();
                      }
                    }}
                  />
                  <button type="button" className="small" onClick={addReminder} disabled={!reminderMessage.trim()}>
                    <DynamicIcon name="plus" size={14} /> إضافة تذكير
                  </button>
                </div>
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
              {reminders.length > 0 && (
                <p className="wizard-empty-hint">
                  <DynamicIcon name="bell" size={12} /> ضبطت تذكيرات قبل بداية المهمة، فلازم تحدد وقت البداية هنا.
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
              <div className="wizard-review-row wizard-review-row-subtasks">
                <span className="wizard-review-label"><DynamicIcon name="list-checks" size={14} /> فرعية</span>
                {subtasks.length > 0 ? (
                  <ol className="wizard-review-subtask-list">
                    {subtasks.map((s, i) => (
                      <li key={s.id ?? `new-${i}`}>{s.content}</li>
                    ))}
                  </ol>
                ) : (
                  <span className="wizard-review-value">مفيش</span>
                )}
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="flag" size={14} /> الأولوية</span>
                <span className="wizard-review-value">{reviewPriority.label}</span>
              </div>
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="tag" size={14} /> التصنيف</span>
                <span className="wizard-review-value">{reviewCategory ? reviewCategory.label : 'مفيش'}</span>
              </div>
              {requiresParentGoal(category) && (
                <div className="wizard-review-row">
                  <span className="wizard-review-label"><DynamicIcon name="route" size={14} /> {goalLabelFor(category)} الأب</span>
                  <span className="wizard-review-value">{reviewParentGoal ? reviewParentGoal.title : 'بدون ربط'}</span>
                </div>
              )}
              <div className="wizard-review-row">
                <span className="wizard-review-label"><DynamicIcon name="compass" size={14} /> مجال الحياة</span>
                <span className="wizard-review-value">{reviewLifeArea ? reviewLifeArea.name : 'مفيش'}</span>
              </div>
              <div className="wizard-review-row wizard-review-row-subtasks">
                <span className="wizard-review-label"><DynamicIcon name="bell" size={14} /> التذكيرات</span>
                {reminders.length > 0 ? (
                  <ul className="wizard-review-subtask-list">
                    {reminders.map((r, i) => (
                      <li key={r.id ?? `new-${i}`}>
                        قبل البداية بـ {formatOffsetFromMinutes(r.offsetMinutes)}
                        {r.message ? ` — ${r.message}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="wizard-review-value">مفيش</span>
                )}
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
              {submitting ? (isEditing ? 'جاري الحفظ…' : 'جاري الإنشاء…') : isEditing ? 'حفظ التعديلات' : 'إنشاء المهمة'}
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

    {pendingDeleteSubtaskIndex !== null && (
      <ConfirmModal
        title="حذف المهمة الفرعية؟"
        description={
          <>
            هيتم حذف "<strong>{subtasks[pendingDeleteSubtaskIndex]?.content}</strong>" نهائيًا لما تحفظ التعديلات.
          </>
        }
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        onCancel={() => setPendingDeleteSubtaskIndex(null)}
        onConfirm={confirmDeleteSubtask}
      />
    )}

    {pendingDeleteReminderIndex !== null && (
      <ConfirmModal
        title="حذف التذكير؟"
        description={
          <>
            هيتم حذف تذكير "<strong>{reminders[pendingDeleteReminderIndex]?.message || 'بدون رسالة'}</strong>" نهائيًا لما تحفظ التعديلات.
          </>
        }
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        onCancel={() => setPendingDeleteReminderIndex(null)}
        onConfirm={confirmDeleteReminder}
      />
    )}
    </>
    </Portal>
  );
}
