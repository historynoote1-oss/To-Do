// ===== خريطة الأهداف (Goal Map) =====
// الشاشة المخصصة لتخطيط الأهداف الهرمية: سنة ← شهر ← أسبوع ← يوم.
//
// الشاشة دلوقتي مبنية على فكرتين واضحتين بدل شجرة واحدة متداخلة بصريًا:
//
// ١) "بناء الخطة" — تبويبات مستوى (سنوية/شهرية/أسبوعية/يومية) جوه تبويب
//    السنة، كل مستوى بيعرض قائمة مسطّحة (مش متداخلة) سهلة القراءة. تدوس
//    على هدف عشان "تنزل" لأهدافه الفرعية (بريدكرمب بيتابع مكانك بالظبط)،
//    وزرار "+" في الهيدر بيضيف هدف جديد في المستوى/المكان اللي واقف فيه.
// ٢) "خريطة العرض الكاملة" — نفس فكرة الشجرة المتداخلة القديمة (GoalNode)
//    لكن كقسم منفصل تحت، للي عايز يشوف الترابط كله دفعة واحدة بعد ما يخلّص
//    الإدخال.
//
// المصدر الوحيد للحقيقة هنا برضه هو نفس `lists` الجاية من الصفحة الرئيسية
// (نفس الـ prop بالظبط) — مفيش طلب سيرفر إضافي ولا حالة منفصلة، إحنا بس
// بنعيد ترتيبها بصريًا حسب `parentGoalId`/`category`/`targetYear`. كل كارت
// هدف هنا هو نفس مكوّن TodoList المستخدم في كل الموقع بالظبط، بما فيه زرار
// "إضافة هدف فرعي" جوّاه (اللي بيفتح نافذته الخاصة مربوطة بالهدف ده تلقائيًا)
// — إحنا هنا بس بنضيف زرار "استعراض الأهداف الفرعية" فوقه عشان التنقل.

import { useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import TodoList from './TodoList';
import BackButton from './BackButton';
import ConfirmModal from './ConfirmModal';
import AccountPasswordConfirmModal from './AccountPasswordConfirmModal';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';
import { CategoryKey, categoryOf, MONTH_NAMES, WEEK_LABELS, DAY_OF_WEEK_NAMES } from '../lib/category';
import { LifeAreaData, hexToSoftBg } from '../lib/lifeArea';
import type { NewTaskPayload } from './AddTaskModal';
import type { GoalOption, TrashedYear } from '../lib/api';
import {
  getTrash,
  trashYear as trashYearApi,
  restoreTrashedYear,
  deleteListCascade,
  updateList,
  getReminders,
  addItem,
  deleteItem,
  updateItemContent,
  reorderItems,
  createReminder,
  updateReminder,
  deleteReminder,
} from '../lib/api';
import { toast } from '../lib/toast';

const AddTaskModal = lazy(() => import('./AddTaskModal'));

// مدة الضغطة المطوّلة (مللي ثانية) اللازمة عشان تتفعّل عملية حذف السنة —
// أطول من الضغطة العادية اللي بتختار السنة، عشان محدش يحذف بالغلط.
const LONG_PRESS_MS = 550;

interface GoalList {
  id: string;
  title: string;
  category?: string | null;
  targetYear?: number | null;
  targetMonth?: number | null;
  targetWeek?: number | null;
  targetDayOfWeek?: number | null;
  parentGoalId?: string | null;
  parentGoal?: { id: string; title: string; category: string | null; targetYear: number | null } | null;
  subGoals?: { id: string; title: string; category: string | null; archivedAt: string | null; archiveReason: string | null }[];
  archivedAt?: string | null;
  archiveReason?: string | null;
  confirmedDone?: boolean;
  overduePenalizedAt?: string | null;
  items: any[];
  [key: string]: any;
}

interface Props {
  lists: GoalList[];
  lifeAreas: LifeAreaData[];
  onBack: () => void;
  onChange: () => void;
  onDeleteList: (id: string) => void;
  onManageLifeAreas: () => void;
  onCreateGoal: (data: NewTaskPayload) => Promise<void> | void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  onLifeAreaCreated?: (area: LifeAreaData) => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = 3000;

// ترتيب المستويات الأربعة من قمة الهرم لقاعه — نفس ترتيب الاستخدام في كل
// مكان تاني في الشاشة دي (تبويبات المستوى، حساب الأعداد...).
const LEVELS: CategoryKey[] = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY'];

function clampToFutureYear(y: number) {
  return Math.max(CURRENT_YEAR, Math.min(MAX_YEAR, y));
}

// تسمية "أهداف شهرية" (نكرة جمع) — بتُستخدم في قائمة اختيار المستوى بعد
// زرار "إضافة مهام / أهداف".
function pluralIndefinite(level: CategoryKey): string {
  return `أهداف ${categoryOf(level)!.label}`;
}

// ===== "خريطة العرض الكاملة" — Zoom Navigation =====
// بدل الشجرة المتداخلة القديمة (كل المستويات ظاهرة دفعة واحدة بتعشيش
// بصري)، هنا كل ضغطة بتدخل المستخدم مستوى أعمق زي فتح مجلد، بترتيب:
// مجال حياة ← سنة ← هدف سنوي ← أهداف شهرية ← أسبوعية ← يومية ← المهمة
// نفسها. `ZoomFolderGrid` هي وحدة البناء المشتركة لأي مستوى "مجلدات"
// (كل حاجة قبل المهمة النهائية) — كارت لكل عنصر بعنوان/أيقونة/شريط تقدّم،
// والضغط عليه بينفّذ `onOpen` بتاعه (اللي بيتحكم فيه GoalMap نفسه).
interface ZoomFolderItem {
  key: string;
  title: string;
  icon: string;
  color?: string;
  bg?: string;
  doneCount: number;
  totalCount: number;
  onOpen: () => void;
  // ===== تمييز بصري: خانة تقويمية (شهر/أسبوع/يوم) مقابل هدف حقيقي =====
  // من مراجعة التصميم: قبل كده كل مستويات الزوم (مجال حياة، سنة، هدف
  // سنوي، شهر التقويم، هدف شهري، أسبوع التقويم...) كانت بتتعرض بنفس
  // الكارت بالظبط، فكان صعب تفرّق بصريًا بين "خانة تقويمية ثابتة" (شهر 7
  // مثلًا، مش هدف اسمه حد اختاره) و"هدف حقيقي" (بعنوان كتبه المستخدم).
  // `calendar: true` بيفعّل شكل مصغّر ومحايد اللون (رقم كبير + اسم صغير)
  // بدل الشكل الملوّن الكامل، عشان شبكة الشهور/الأسابيع/الأيام تبان
  // "تقويم" واضح تحت عينك مش قائمة أهداف تانية.
  calendar?: boolean;
  badge?: string;
  // ===== حذف بالتبعيات + تعديل (مباشرة من كارت الهدف في الزوم) =====
  // بيتحط بس لما `it` بيمثّل هدف حقيقي (سنوي/شهري/أسبوعي/يومي) — مش خانة
  // تقويمية ولا مجلد تجميعي (مجال حياة/سنة). وجوده هو اللي بيفعّل زرار
  // القلم والضغطة المطوّلة على الكارت ده تحديدًا.
  goal?: GoalList;
}

// شبكة شهور/أسابيع/أيام (variant="calendar") بتحتاج تخطيط مختلف عن شبكة
// المجلدات العادية: عناصر أصغر وثابتة العدد (12/5/7) بدل بطاقات بعرض حر.
type ZoomGridDensity = 'folders' | 'months' | 'weeks' | 'days';

function ZoomFolderGrid({
  items,
  emptyLabel,
  density = 'folders',
  onEditGoal,
  onGoalLongPressStart,
  onGoalLongPressEnd,
  longPressFiredRef,
  pressingGoalId,
}: {
  items: ZoomFolderItem[];
  emptyLabel: string;
  density?: ZoomGridDensity;
  // ===== حذف بالتبعيات + تعديل — شوف `goal` في ZoomFolderItem فوق =====
  // بيتفعّلوا بس على الكروت اللي معاها `goal` (أهداف حقيقية)، والكروت
  // التجميعية (مجال حياة/سنة) والخانات التقويمية بتتجاهلهم تمامًا.
  onEditGoal?: (goal: GoalList) => void;
  onGoalLongPressStart?: (goal: GoalList) => void;
  onGoalLongPressEnd?: () => void;
  longPressFiredRef?: { current: boolean };
  pressingGoalId?: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="zoom-map-empty">
        <DynamicIcon name="folder-open" size={26} className="empty-icon" />
        <p>{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className={`zoom-map-grid ${density !== 'folders' ? `zoom-map-grid-${density}` : ''}`}>
      {items.map((it) => {
        const percent = it.totalCount === 0 ? 0 : Math.round((it.doneCount / it.totalCount) * 100);
        // دائرة إنجاز (المرحلة 7): لما كل أبناء المجلد ده يخلصوا، بنستبدل
        // شريط التقدّم بحلقة/شارة "خلص" واضحة بدل النسبة — نفس فكرة الصح
        // الأخضر على مستوى الكارت المنفرد بس على مستوى المجلد كله.
        const isFullyComplete = it.totalCount > 0 && it.doneCount === it.totalCount;
        if (it.calendar) {
          // ===== كارت خانة تقويمية (شهر/أسبوع/يوم) — شكل مصغّر ومحايد
          // اللون عمدًا (مفيش --zoom-color هنا)، رقم كبير بدل أيقونة، ونقطة
          // إنجاز صغيرة بدل شريط تقدّم كامل — عشان يفضل واضح إنه "خانة
          // تقويمية ثابتة" مش هدف حقيقي كتبه المستخدم. =====
          return (
            <button
              key={it.key}
              type="button"
              className={`zoom-cal-chip ${it.totalCount > 0 ? 'has-goals' : ''} ${isFullyComplete ? 'zoom-cal-chip-complete' : ''}`}
              onClick={it.onOpen}
              title={it.title}
            >
              {it.badge ? (
                <span className="zoom-cal-chip-num" dir="ltr">{it.badge}</span>
              ) : (
                <DynamicIcon name={it.icon} size={15} className="zoom-cal-chip-icon" />
              )}
              <span className="zoom-cal-chip-label">{it.title}</span>
              {it.totalCount > 0 && (
                <span className="zoom-cal-chip-dot" title={`${it.doneCount}/${it.totalCount}`}>
                  {isFullyComplete ? <DynamicIcon name="check" size={10} /> : <span>{it.totalCount}</span>}
                </span>
              )}
            </button>
          );
        }
        // كارت هدف حقيقي (سنوي/شهري/أسبوعي/يومي) بيحمل `goal` — بنغلّفه في
        // `div` عشان نقدر نحط زرار "تعديل" كعنصر شقيق منفصل فوقه (مش جوّاه،
        // لأن زرار جوه زرار مش سليم في الـ HTML)، ونربط الضغطة المطوّلة
        // بالكارت الرئيسي بنفس أسلوب حذف السنة بالظبط.
        const isPressing = !!it.goal && pressingGoalId === it.goal.id;
        return (
          <div key={it.key} className="zoom-folder-card-wrap">
            <button
              type="button"
              className={`zoom-folder-card ${isFullyComplete ? 'zoom-folder-card-complete' : ''} ${isPressing ? 'zoom-folder-card-pressing' : ''}`}
              style={it.color ? ({ ['--zoom-color' as any]: it.color, ['--zoom-bg' as any]: it.bg } as any) : undefined}
              onClick={() => {
                if (it.goal && longPressFiredRef?.current) {
                  longPressFiredRef.current = false;
                  return;
                }
                it.onOpen();
              }}
              onPointerDown={it.goal ? () => onGoalLongPressStart?.(it.goal!) : undefined}
              onPointerUp={it.goal ? onGoalLongPressEnd : undefined}
              onPointerLeave={it.goal ? onGoalLongPressEnd : undefined}
              onPointerCancel={it.goal ? onGoalLongPressEnd : undefined}
              onContextMenu={it.goal ? (e) => e.preventDefault() : undefined}
              title={it.goal ? `${it.title} — اضغط مطوّلًا للحذف` : it.title}
            >
              <span className="zoom-folder-card-icon">
                <DynamicIcon name={it.icon} size={20} />
              </span>
              <span className="zoom-folder-card-title" title={it.title}>
                {it.title}
              </span>
              {it.totalCount > 0 &&
                (isFullyComplete ? (
                  <span className="zoom-folder-card-complete-ring" title={`اكتمل ${it.doneCount}/${it.totalCount}`}>
                    <DynamicIcon name="check" size={13} />
                    <span>مكتمل</span>
                  </span>
                ) : (
                  <span className="zoom-folder-card-progress">
                    <span className="zoom-folder-card-progress-track">
                      <span className="zoom-folder-card-progress-fill" style={{ width: `${percent}%` }} />
                    </span>
                    <span className="zoom-folder-card-progress-label">
                      {it.doneCount}/{it.totalCount} · {percent}٪
                    </span>
                  </span>
                ))}
              <DynamicIcon name="chevron-left" size={16} className="zoom-folder-card-chevron" />
            </button>
            {it.goal && onEditGoal && (
              <button
                type="button"
                className="zoom-folder-card-edit-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditGoal(it.goal!);
                }}
                aria-label="تعديل الهدف"
                title="تعديل"
              >
                <DynamicIcon name="pencil" size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function GoalMap({
  lists,
  lifeAreas,
  onBack,
  onChange,
  onDeleteList,
  onManageLifeAreas,
  onCreateGoal,
  onOpenMenu,
  menuOpen,
  onLifeAreaCreated,
}: Props) {
  // كل الأهداف السنوية (قمة الهرم) مجمّعة حسب السنة المستهدفة.
  const yearlyGoals = useMemo(() => lists.filter((l) => l.category === 'YEARLY'), [lists]);

  // ===== منطق الإنجاز الجديد + المهام المتأخرة (المرحلة 7) =====
  // أهداف/مهام خريطة الأهداف اللي فاتت معادها (endTime + 10 دقايق) من
  // غير إنجاز — بتفضل نشطة في مكانها (مش بتتأرشف زي المهام العادية) بس
  // بتظهر هنا بشكل لافت أعلى الصفحة عشان المستخدم يراجعها ويعدّلها.
  // شوف lib/overdueScheduler.ts في الباك إند لمنطق التعليم/الخصم نفسه.
  const overdueGoals = useMemo(() => lists.filter((l) => !!l.overduePenalizedAt), [lists]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const g of yearlyGoals) {
      if (g.targetYear) set.add(g.targetYear);
    }
    // نضمن إن السنة الحالية دايمًا ظاهرة كخيار حتى لو لسه معملش فيها أهداف،
    // عشان تبقى نقطة انطلاق واضحة لمستخدم جديد.
    set.add(CURRENT_YEAR);
    return Array.from(set).sort((a, b) => a - b);
  }, [yearlyGoals]);

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    // افتراضيًا بنبدأ بأحدث سنة فيها أهداف فعلاً (لو موجودة)، وإلا السنة الحالية.
    if (yearlyGoals.length > 0) {
      const withGoals = Array.from(new Set(yearlyGoals.map((g) => g.targetYear || CURRENT_YEAR)));
      return withGoals.includes(CURRENT_YEAR) ? CURRENT_YEAR : Math.max(...withGoals);
    }
    return CURRENT_YEAR;
  });

  // ===== إضافة سنة جديدة: ستيبر +/- بس، بدون كتابة يدوية، ومينفعش تنزل
  // تحت السنة الحالية (مفيش "سنوات منتهية" جديدة). =====
  const [addYearOpen, setAddYearOpen] = useState(false);
  const [newYearDraft, setNewYearDraft] = useState(CURRENT_YEAR);

  // ===== حذف سنة (ضغطة مطوّلة) وسلة المحذوفات المؤقتة =====
  // ضغطة مطوّلة على أي تبويب سنة بتفتح تأكيد الحذف؛ بعد التأكيد، السنة
  // بكل محتواها (كل المستويات) بتتنقل لسلة محذوفات مؤقتة لمدة 5 أيام قابلة
  // للاسترجاع، بعدها بتتحذف نهائيًا تلقائيًا من السيرفر (شوف lib/trash.ts
  // وlib/trashScheduler.ts في الباك إند).
  const [confirmDeleteYear, setConfirmDeleteYear] = useState<number | null>(null);
  const [trashPanelOpen, setTrashPanelOpen] = useState(false);
  const [trashedYears, setTrashedYears] = useState<TrashedYear[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringYear, setRestoringYear] = useState<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  async function refreshTrash() {
    setTrashLoading(true);
    try {
      const data = await getTrash();
      setTrashedYears(data);
    } catch {
      // فشل تحميل سلة المحذوفات مش لازم يوقف باقي الصفحة — بنسيبها فاضية
      // والمستخدم يقدر يجرّب يفتح الپانل تاني.
    } finally {
      setTrashLoading(false);
    }
  }

  useEffect(() => {
    refreshTrash();
  }, []);

  function startYearLongPress(y: number) {
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      sounds.click();
      setConfirmDeleteYear(y);
    }, LONG_PRESS_MS);
  }

  function cancelYearLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleYearChipClick(y: number) {
    // لو الضغطة المطوّلة اتفعّلت بالفعل وفتحت تأكيد الحذف، منمنعش الضغطة
    // العادية (اختيار السنة) من إنها تتنفذ كمان فوق بعض.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    selectYear(y);
  }

  // ===== حذف هدف بكل تبعياته (ضغطة مطوّلة على كارته في خريطة العرض
  // الكاملة) — نفس فكرة حذف السنة بالظبط بس: (1) حذف نهائي فوري (مش سلة
  // محذوفات، الأهداف هنا مش سنة كاملة)، و(2) خطوة تأكيد إضافية بكلمة مرور
  // الحساب قبل التنفيذ الفعلي، شوف lib/api.ts (deleteListCascade) و
  // middleware/requireAccountPassword في الباك إند. =====
  const goalLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalLongPressFiredRef = useRef(false);
  const [pressingGoalId, setPressingGoalId] = useState<string | null>(null);
  // المرحلة الأولى: تأكيد عادي بيعرض عدد الأهداف الفرعية اللي هتتحذف معاه.
  const [cascadeDeleteCandidate, setCascadeDeleteCandidate] = useState<GoalList | null>(null);
  // المرحلة الثانية (بعد التأكيد الأول): كلمة مرور الحساب للتنفيذ الفعلي.
  const [cascadePasswordFor, setCascadePasswordFor] = useState<GoalList | null>(null);

  function startGoalLongPress(goal: GoalList) {
    goalLongPressFiredRef.current = false;
    setPressingGoalId(goal.id);
    if (goalLongPressTimerRef.current) clearTimeout(goalLongPressTimerRef.current);
    goalLongPressTimerRef.current = setTimeout(() => {
      goalLongPressFiredRef.current = true;
      setPressingGoalId(null);
      sounds.click();
      setCascadeDeleteCandidate(goal);
    }, LONG_PRESS_MS);
  }

  function cancelGoalLongPress() {
    setPressingGoalId(null);
    if (goalLongPressTimerRef.current) {
      clearTimeout(goalLongPressTimerRef.current);
      goalLongPressTimerRef.current = null;
    }
  }

  // معاينة عدد التبعيات (شهري/أسبوعي/يومي) اللي هتتحذف مع الهدف — بنفس
  // أسلوب حساب yearGoalsByLevel فوق (مشي طبقة طبقة عبر parentGoalId)، بس
  // بادئ من الهدف المطلوب حذفه بدل قمة الهرم، وبدون تنفيذ أي طلب سيرفر
  // إضافي (البيانات موجودة أصلًا في `lists`).
  function cascadeChildCounts(goalId: string) {
    const counts: Record<CategoryKey, number> = { YEARLY: 0, MONTHLY: 0, WEEKLY: 0, DAILY: 0 };
    let frontierIds = [goalId];
    while (frontierIds.length > 0) {
      const frontierSet = new Set(frontierIds);
      const children = lists.filter((l) => l.parentGoalId && frontierSet.has(l.parentGoalId));
      if (children.length === 0) break;
      for (const child of children) {
        const cat = (child.category as CategoryKey) || 'MONTHLY';
        if (counts[cat] != null) counts[cat]++;
      }
      frontierIds = children.map((c) => c.id);
    }
    return counts;
  }

  async function confirmCascadeDeleteNow(password: string) {
    const goal = cascadePasswordFor;
    if (!goal) return;
    await deleteListCascade(goal.id, password);
    sounds.click();
    toast.success(`"${goal.title}" اتحذف نهائيًا مع كل تبعياته`);
    setCascadePasswordFor(null);
    onChange();
  }

  // ===== تعديل هدف مباشرة من كارته (زرار القلم) — نفس ويزارد الإنشاء بس
  // في وضع تعديل، بنفس منطق TodoList.tsx بالظبط (openEditModal +
  // handleEditSave) عشان التعديل يشتغل صح على المهام الفرعية والتذكيرات
  // المرتبطة بالهدف مش بس حقوله الأساسية. =====
  const [editGoal, setEditGoal] = useState<GoalList | null>(null);
  const [editGoalReminders, setEditGoalReminders] = useState<
    { id: string; offsetMinutes: number; message: string | null }[]
  >([]);

  async function openEditGoal(goal: GoalList) {
    setEditGoal(goal);
    try {
      const reminders = await getReminders({ listId: goal.id });
      const startMs = goal.startTime ? new Date(goal.startTime).getTime() : null;
      setEditGoalReminders(
        reminders
          .filter((r: any) => !r.itemId)
          .map((r: any) => ({
            id: r.id,
            offsetMinutes: startMs !== null ? Math.max(0, Math.round((startMs - new Date(r.remindAt).getTime()) / 60000)) : 0,
            message: r.message ?? null,
          }))
      );
    } catch {
      setEditGoalReminders([]);
    }
  }

  async function handleEditGoalSave(id: string, data: NewTaskPayload) {
    const nextFields = {
      title: data.title,
      priority: data.priority,
      category: data.category,
      targetYear: data.targetYear,
      targetMonth: data.targetMonth,
      targetWeek: data.targetWeek,
      targetDayOfWeek: data.targetDayOfWeek,
      lifeAreaId: data.lifeAreaId,
      parentGoalId: data.parentGoalId,
      startTime: data.startTime,
      endTime: data.endTime,
    };
    try {
      await updateList(id, nextFields);

      // المهام الفرعية اللي اتشالت من الويزارد.
      for (const itemId of data.deletedSubtaskIds) {
        await deleteItem(itemId);
      }

      // المهام الفرعية الموجودة أصلًا — تحديث نصها لو اتغيّر.
      const existingBeforeById = new Map((editGoal?.items || []).map((it: any) => [it.id, it.content]));
      for (const s of data.subtasks) {
        if (s.id && existingBeforeById.get(s.id) !== s.content) {
          await updateItemContent(s.id, s.content);
        }
      }

      // المهام الفرعية الجديدة.
      const newSubtaskContents = data.subtasks.filter((s) => !s.id).map((s) => s.content);
      const createdItemIds: string[] = [];
      for (const content of newSubtaskContents) {
        const created = await addItem(id, content);
        createdItemIds.push(created.id);
      }

      // حفظ الترتيب النهائي.
      let createdIdx = 0;
      const finalOrderIds = data.subtasks.map((s) => (s.id ? s.id : createdItemIds[createdIdx++]));
      if (finalOrderIds.length > 0) {
        await reorderItems(finalOrderIds.map((itemId, index) => ({ id: itemId, position: index })));
      }

      // التذكيرات اللي اتشالت.
      for (const reminderId of data.deletedReminderIds) {
        await deleteReminder(reminderId);
      }

      // المهمة الرئيسية (الهدف) معندهاش dueDate، فبنحسب remindAt بنفسنا من
      // وقت بدايتها — نفس منطق TodoList.tsx بالظبط.
      if (data.startTime) {
        for (const r of data.reminders) {
          const remindAt = new Date(new Date(data.startTime).getTime() - r.offsetMinutes * 60 * 1000).toISOString();
          if (r.id) {
            await updateReminder(r.id, { remindAt, message: r.message || undefined });
          } else {
            await createReminder({ listId: id, mode: 'CUSTOM', remindAt, message: r.message || undefined });
          }
        }
      }

      sounds.click();
      toast.success('اتحدّثت المهمة');
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ التعديلات');
      throw err;
    }
  }

  async function confirmDeleteYearNow() {
    const y = confirmDeleteYear;
    if (y == null) return;
    try {
      await trashYearApi(y);
      toast.success(`سنة ${y} اتنقلت لسلة المحذوفات — تقدر تسترجعها خلال 5 أيام`);
      setConfirmDeleteYear(null);
      onChange();
      refreshTrash();
      if (selectedYear === y) {
        setSelectedYear(CURRENT_YEAR);
      }
    } catch (err: any) {
      toast.error(err?.message || 'حصل خطأ أثناء حذف السنة');
      setConfirmDeleteYear(null);
    }
  }

  async function restoreYearNow(y: number) {
    setRestoringYear(y);
    try {
      await restoreTrashedYear(y);
      toast.success(`سنة ${y} اترجعت من سلة المحذوفات`);
      onChange();
      refreshTrash();
    } catch (err: any) {
      toast.error(err?.message || 'حصل خطأ أثناء الاسترجاع');
    } finally {
      setRestoringYear(null);
    }
  }

  const yearGoalsForSelected = useMemo(
    () => yearlyGoals.filter((g) => (g.targetYear || CURRENT_YEAR) === selectedYear),
    [yearlyGoals, selectedYear]
  );

  // كل أهداف السنة المختارة مجمّعة حسب المستوى (سنوي/شهري/أسبوعي/يومي) —
  // بنبنيها بمشي طبقة طبقة من الأهداف السنوية لتحت (BFS)، عشان نقدر نحسب
  // عدد كل مستوى في هيدر التبويب من غير ما نحتاج طلب سيرفر إضافي.
  const yearGoalsByLevel = useMemo(() => {
    const byLevel: Record<CategoryKey, GoalList[]> = {
      YEARLY: yearGoalsForSelected,
      MONTHLY: [],
      WEEKLY: [],
      DAILY: [],
    };
    let frontierIds = yearGoalsForSelected.map((g) => g.id);
    while (frontierIds.length > 0) {
      const frontierSet = new Set(frontierIds);
      const children = lists.filter((l) => l.parentGoalId && frontierSet.has(l.parentGoalId));
      if (children.length === 0) break;
      for (const child of children) {
        const cat = (child.category as CategoryKey) || 'MONTHLY';
        if (byLevel[cat]) byLevel[cat].push(child);
      }
      frontierIds = children.map((c) => c.id);
    }
    return byLevel;
  }, [lists, yearGoalsForSelected]);

  // ===== إحصائية تقدّم السنة (المرحلة 8) =====
  // نسبة الإنجاز محسوبة على *كل* أهداف السنة المختارة على كل المستويات
  // الأربعة مع بعض (نفس مصدر yearGoalsByLevel)، مش بس الأهداف السنوية —
  // عشان النسبة تعكس فعليًا كل خطة السنة، مش بس هدف/هدفين كبار.
  const yearProgressStats = useMemo(() => {
    const all = [
      ...yearGoalsByLevel.YEARLY,
      ...yearGoalsByLevel.MONTHLY,
      ...yearGoalsByLevel.WEEKLY,
      ...yearGoalsByLevel.DAILY,
    ];
    const total = all.length;
    const done = all.filter((g) => g.confirmedDone).length;
    const overdue = all.filter((g) => g.overduePenalizedAt).length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, overdue, percent };
  }, [yearGoalsByLevel]);

  function selectYear(y: number) {
    sounds.click();
    setSelectedYear(y);
  }

  function openAddYearStepper() {
    sounds.click();
    setNewYearDraft(clampToFutureYear(Math.max(...years, CURRENT_YEAR) + 1));
    setAddYearOpen(true);
  }

  function stepYearDraft(delta: number) {
    setNewYearDraft((y) => {
      const next = clampToFutureYear(y + delta);
      if (next === y && delta < 0) {
        // وصل لأقل سنة مسموحة (السنة الحالية) — نوضّح للمستخدم إنه مينفعش ينزل أكتر.
        sounds.error();
        return y;
      }
      sounds.click();
      return next;
    });
  }

  function confirmAddYear() {
    sounds.click();
    setSelectedYear(newYearDraft);
    setAddYearOpen(false);
    // مفيش فتح نافذة إنشاء هدف هنا خالص — إضافة الأهداف كلها بقت مسؤولية
    // قسم "بناء الخطة" تحت، مش لحظة إنشاء السنة نفسها.
  }

  // ===== قسم "بناء الخطة" بقى بس زرار واحد: "إضافة مهام / أهداف" =====
  // الضغط عليه بيفتح قائمة اختيار المستوى الأربعة (سنوي/شهري/أسبوعي/يومي)،
  // وكل مستوى بيفتح نافذة الإنشاء الكاملة (نفس الويزارد باحترافيته وكل
  // خطواته: العنوان، المهام الفرعية، الأولوية، خانة التقويم، الهدف الأب،
  // مجال الحياة، التوقيت، التذكيرات...) — الويزارد نفسه هو اللي بيضمن
  // ربط الهدف بالمستوى اللي فوقه صح (خطوة "الهدف الأب" بتفلتر الخيارات
  // حسب المستوى المطلوب تلقائيًا، شوف AddTaskModal + lib/category.ts).
  const [addLevelPickerOpen, setAddLevelPickerOpen] = useState(false);
  const [addModal, setAddModal] = useState<{ open: boolean; category: CategoryKey | null; parent: GoalOption | null }>(
    { open: false, category: null, parent: null }
  );

  function openAddLevelPicker() {
    sounds.click();
    setAddLevelPickerOpen(true);
  }

  function openAddForLevel(level: CategoryKey) {
    sounds.click();
    setAddLevelPickerOpen(false);
    // الهدف الأب مش محدد مقدّمًا هنا عمدًا (إلا للسنوي اللي مالوش أب أصلًا)
    // — خطوة "الهدف الأب" جوه الويزارد هي اللي هتخلي المستخدم يختاره بنفسه
    // من قائمة مفلترة صح حسب المستوى، فمفيش لغبطة أو ربط غلط.
    setAddModal({ open: true, category: level, parent: null });
  }

  // ===== بعد ما يتضاف هدف: قفزة تلقائية لمكانه الصح في "خريطة العرض
  // الكاملة" حسب البيانات اللي المستخدم دخّلها بالظبط (مش رجوع لمكان
  // عشوائي) =====
  // بنستخدم نفس بيانات الفورم (parentGoalId + الخانة الزمنية) عشان نبني
  // سلسلة الآباء (سنوي ← شهري ← أسبوعي) من `lists` الموجودة أصلًا (كلهم
  // اتضافوا قبل كده، فمعرّفاتهم موجودة)، من غير ما نحتاج id الهدف الجديد
  // نفسه — بنفتح على "حاوية" الهدف الجديد (الخانة التقويمية اللي اتحط
  // فيها) مش جوّاه، عشان يبان مع بقية إخوته في نفس المكان.
  function placementForCreatedGoal(data: NewTaskPayload) {
    const category = data.category as CategoryKey;
    if (category === 'YEARLY') {
      return {
        lifeAreaId: data.lifeAreaId || 'none',
        year: data.targetYear ?? CURRENT_YEAR,
        chainIds: [] as string[],
        month: null as number | null,
        week: null as number | null,
        day: null as number | null,
      };
    }
    if (!data.parentGoalId) return null;
    const immediateParent = lists.find((l) => l.id === data.parentGoalId);
    if (!immediateParent) return null;
    const chain: GoalList[] = [];
    let current: GoalList | undefined = immediateParent;
    while (current) {
      chain.unshift(current);
      current = current.parentGoalId ? lists.find((l) => l.id === current!.parentGoalId) : undefined;
    }
    const yearlyAncestor = chain[0];
    let month: number | null = null;
    let week: number | null = null;
    for (const g of chain) {
      if (g.category === 'MONTHLY' && g.targetMonth) month = g.targetMonth;
      if (g.category === 'WEEKLY' && g.targetWeek) week = g.targetWeek;
    }
    if (category === 'MONTHLY') month = data.targetMonth ?? month;
    if (category === 'WEEKLY') week = data.targetWeek ?? week;
    const day = category === 'DAILY' ? data.targetDayOfWeek ?? null : null;
    return {
      lifeAreaId: yearlyAncestor.lifeAreaId || 'none',
      year: yearlyAncestor.targetYear ?? CURRENT_YEAR,
      chainIds: chain.map((g) => g.id),
      month,
      week,
      day,
    };
  }

  function navigateToPlacement(placement: NonNullable<ReturnType<typeof placementForCreatedGoal>>) {
    setZoomFilterLifeArea('all');
    setZoomFilterYear('all');
    setZoomFilterStatus('all');
    setZoomFilterPriority('all');
    setZoomFilterOpen(false);
    setZoomLifeAreaId(placement.lifeAreaId);
    setZoomYear(placement.year);
    setZoomGoalChainIds(placement.chainIds);
    setZoomMonth(placement.month);
    setZoomWeek(placement.week);
    setZoomDay(placement.day);
    setTreeOpen(true);
    window.setTimeout(() => {
      document.querySelector('.goal-map-tree-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  async function handleCreateAndNavigate(data: NewTaskPayload) {
    await onCreateGoal(data);
    const placement = placementForCreatedGoal(data);
    if (placement) navigateToPlacement(placement);
  }

  // "بناء الخطة" هو المدخل السريع لإضافة أهداف/مهام؛ فبيفضل مفتوح افتراضيًا.
  const [planBuilderOpen, setPlanBuilderOpen] = useState(true);

  // ===== قسم "خريطة العرض الكاملة" (Zoom Navigation) — قابل للطي/الفتح. =====
  const [treeOpen, setTreeOpen] = useState(false);

  // ===== مسار التنقل بالزوم: مجال حياة ← سنة ← سلسلة الأهداف المُختارة =====
  // بنخزّن الأهداف بمعرّفاتها (IDs) بس، مش الكائن نفسه، عشان لو `lists`
  // اتحدّثت (تعديل/حذف/إضافة) المسار يفضل صحيح تلقائيًا (وأي معرّف بقى
  // محذوف بيتفلتر لوحده من غير ما يكسر الشاشة).
  const [zoomLifeAreaId, setZoomLifeAreaId] = useState<string | null>(null);
  const [zoomYear, setZoomYear] = useState<number | null>(null);
  const [zoomGoalChainIds, setZoomGoalChainIds] = useState<string[]>([]);
  // ===== خانات التقويم الحقيقي (شهر/أسبوع/يوم) — المرحلة 9 =====
  // بعد ما هدف سنوي يتفتح، بنعرض شبكة تقويمية حقيقية (12 شهر بأرقامهم)
  // بدل قائمة أسماء أهداف مباشرة. زوم داخل شهر معيّن بيعرض الأهداف الشهرية
  // (targetMonth) المرتبطة بيه؛ زوم داخل هدف شهري بيعرض شبكة أسابيع
  // الشهر (5 أسابيع ثابتة)؛ زوم داخل أسبوع بيعرض الأهداف الأسبوعية
  // (targetWeek) المرتبطة بيه؛ زوم داخل هدف أسبوعي بيعرض شبكة أيام
  // الأسبوع (7 أيام ثابتة)؛ وزوم داخل يوم بيعرض الأهداف اليومية
  // (targetDayOfWeek) المرتبطة بيه — وهي دي المستوى النهائي (المهمة نفسها).
  // كل خانة بتتصفّر تلقائيًا لما نفتح هدف من المستوى بتاعها (شوف
  // zoomOpenGoal) أو لما نرجع لمستوى أعلى (شوف zoomGoToStage).
  const [zoomMonth, setZoomMonth] = useState<number | null>(null);
  const [zoomWeek, setZoomWeek] = useState<number | null>(null);
  const [zoomDay, setZoomDay] = useState<number | null>(null);

  // ===== فلاتر خريطة العرض الكاملة (المرحلة 8) =====
  // بتخص قسم "خريطة العرض الكاملة" بس (مش بناء الخطة فوق). مجال الحياة
  // والسنة بيشتغلوا كـ"قفزة" مباشرة لنفس مكان اختيارهم من الشبكة (بدل ما
  // المستخدم يضغط كارت بكارت)، والحالة/الأولوية بيفلتروا العناصر الظاهرة
  // فعليًا في أي مستوى واقف فيه المستخدم دلوقتي.
  const [zoomFilterOpen, setZoomFilterOpen] = useState(false);
  const [zoomFilterLifeArea, setZoomFilterLifeArea] = useState<string>('all');
  const [zoomFilterYear, setZoomFilterYear] = useState<string>('all');
  const [zoomFilterStatus, setZoomFilterStatus] = useState<'all' | 'done' | 'pending' | 'overdue'>('all');
  const [zoomFilterPriority, setZoomFilterPriority] = useState<'all' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');

  const zoomFiltersActiveCount = [
    zoomFilterLifeArea !== 'all',
    zoomFilterYear !== 'all',
    zoomFilterStatus !== 'all',
    zoomFilterPriority !== 'all',
  ].filter(Boolean).length;

  // بيتفحص بس على الحالة/الأولوية — دول الوحيدين اللي معناهم موجود على أي
  // هدف في أي مستوى (مجال الحياة والسنة بيبقوا فاضيين على غير الأهداف
  // السنوية أصلًا، فتطبيقهم هنا كان هيفلتر كل حاجة تحت المستوى السنوي غلط).
  function matchesZoomStatusPriority(g: GoalList) {
    if (zoomFilterStatus !== 'all') {
      const isOverdue = !!g.overduePenalizedAt;
      const isDone = !!g.confirmedDone;
      if (zoomFilterStatus === 'overdue' && !isOverdue) return false;
      if (zoomFilterStatus === 'done' && !isDone) return false;
      if (zoomFilterStatus === 'pending' && (isDone || isOverdue)) return false;
    }
    if (zoomFilterPriority !== 'all' && (g.priority || 'NONE') !== zoomFilterPriority) return false;
    return true;
  }

  function clearZoomFilters() {
    sounds.click();
    setZoomFilterLifeArea('all');
    setZoomFilterYear('all');
    setZoomFilterStatus('all');
    setZoomFilterPriority('all');
  }

  // اختيار مجال حياة من الفلتر بيقفز فورًا لنفس شاشته (زي الضغط على كارته
  // بالظبط)، و"الكل" بيرجّع لشاشة اختيار المجالات.
  function onZoomFilterLifeAreaChange(value: string) {
    sounds.click();
    setZoomFilterLifeArea(value);
    if (value === 'all') {
      setZoomLifeAreaId(null);
      setZoomYear(null);
      setZoomGoalChainIds([]);
    } else {
      setZoomLifeAreaId(value);
      setZoomYear(null);
      setZoomGoalChainIds([]);
    }
  }

  function onZoomFilterYearChange(value: string) {
    sounds.click();
    setZoomFilterYear(value);
    if (value !== 'all' && zoomLifeAreaId != null) {
      setZoomYear(Number(value));
      setZoomGoalChainIds([]);
    }
  }

  const zoomGoalChain = useMemo(
    () => zoomGoalChainIds.map((id) => lists.find((l) => l.id === id)).filter(Boolean) as GoalList[],
    [zoomGoalChainIds, lists]
  );
  // أهداف المستوى الهرمي الأربعة الحالية جوه سلسلة الزوم (undefined لو
  // لسه معملتش زوم لحد المستوى ده) — استخدامها بيبسّط شرط عرض شبكة كل
  // مرحلة تقويمية (شهور/أسابيع/أيام) بدل ما نكرر zoomGoalChain[i] كل مرة.
  const zoomAnnualGoal = zoomGoalChain[0] as GoalList | undefined;
  const zoomMonthlyGoal = zoomGoalChain[1] as GoalList | undefined;
  const zoomWeeklyGoal = zoomGoalChain[2] as GoalList | undefined;
  const zoomDailyGoal = zoomGoalChain[3] as GoalList | undefined;

  const zoomFilteredYearlyGoals = useMemo(
    () => yearlyGoals.filter(matchesZoomStatusPriority),
    [yearlyGoals, zoomFilterStatus, zoomFilterPriority]
  );

  const zoomLifeAreaBuckets = useMemo(() => {
    const map = new Map<string, GoalList[]>();
    for (const g of zoomFilteredYearlyGoals) {
      const key = g.lifeAreaId || 'none';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return map;
  }, [zoomFilteredYearlyGoals]);

  const zoomYearsInLifeArea = useMemo(() => {
    if (zoomLifeAreaId == null) return [] as number[];
    const goals = zoomLifeAreaBuckets.get(zoomLifeAreaId) || [];
    const set = new Set<number>();
    for (const g of goals) set.add(g.targetYear || CURRENT_YEAR);
    return Array.from(set).sort((a, b) => a - b);
  }, [zoomLifeAreaBuckets, zoomLifeAreaId]);

  const zoomYearlyGoals = useMemo(() => {
    if (zoomLifeAreaId == null || zoomYear == null) return [] as GoalList[];
    return (zoomLifeAreaBuckets.get(zoomLifeAreaId) || []).filter((g) => (g.targetYear || CURRENT_YEAR) === zoomYear);
  }, [zoomLifeAreaBuckets, zoomLifeAreaId, zoomYear]);

  // ===== شبكات المستويات التقويمية (المرحلة 9) =====
  // مجموعات الأهداف الشهرية/الأسبوعية/اليومية تحت الهدف/الخانة الحالية،
  // مفلترة كمان بالحالة/الأولوية زي أي مستوى تاني. كل واحدة بتُستخدم مرتين:
  // مرة لحساب عدد كل خانة تقويمية (شهر/أسبوع/يوم) في شبكة الاختيار، ومرة
  // تانية لعرض قائمة الأهداف الفعلية بعد ما المستخدم يختار الخانة.
  const zoomMonthlyGoalsInYear = useMemo(() => {
    if (!zoomAnnualGoal) return [] as GoalList[];
    return lists.filter((l) => l.parentGoalId === zoomAnnualGoal.id).filter(matchesZoomStatusPriority);
  }, [lists, zoomAnnualGoal, zoomFilterStatus, zoomFilterPriority]);

  const zoomMonthlyGoalsForSelectedMonth = useMemo(() => {
    if (zoomMonth == null) return [] as GoalList[];
    return zoomMonthlyGoalsInYear.filter((g) => (g.targetMonth || null) === zoomMonth);
  }, [zoomMonthlyGoalsInYear, zoomMonth]);

  const zoomWeeklyGoalsInMonth = useMemo(() => {
    if (!zoomMonthlyGoal) return [] as GoalList[];
    return lists.filter((l) => l.parentGoalId === zoomMonthlyGoal.id).filter(matchesZoomStatusPriority);
  }, [lists, zoomMonthlyGoal, zoomFilterStatus, zoomFilterPriority]);

  const zoomWeeklyGoalsForSelectedWeek = useMemo(() => {
    if (zoomWeek == null) return [] as GoalList[];
    return zoomWeeklyGoalsInMonth.filter((g) => (g.targetWeek || null) === zoomWeek);
  }, [zoomWeeklyGoalsInMonth, zoomWeek]);

  const zoomDailyGoalsInWeek = useMemo(() => {
    if (!zoomWeeklyGoal) return [] as GoalList[];
    return lists.filter((l) => l.parentGoalId === zoomWeeklyGoal.id).filter(matchesZoomStatusPriority);
  }, [lists, zoomWeeklyGoal, zoomFilterStatus, zoomFilterPriority]);

  const zoomDailyGoalsForSelectedDay = useMemo(() => {
    if (zoomDay == null) return [] as GoalList[];
    return zoomDailyGoalsInWeek.filter((g) => (g.targetDayOfWeek ?? null) === zoomDay);
  }, [zoomDailyGoalsInWeek, zoomDay]);

  // نسبة إنجاز مجموعة أهداف — من المرحلة 7: "خلص" هنا معناها confirmedDone
  // = true بس (مش الأرشفة زي قبل كده)، لأن أهداف خريطة الأهداف بقت بتفضل
  // في مكانها بصح أخضر بدل ما تتنقل للأرشيف عند الإنجاز — شوف lib/archive.ts.
  function goalsDoneRatio(goals: GoalList[]) {
    const total = goals.length;
    const done = goals.filter((g) => g.confirmedDone).length;
    return { done, total };
  }

  function lifeAreaMeta(key: string): { title: string; icon: string; color?: string; bg?: string } {
    if (key === 'none') return { title: 'بدون مجال', icon: 'folder' };
    const area = lifeAreas.find((a) => a.id === key);
    if (!area) return { title: 'مجال محذوف', icon: 'folder' };
    return { title: area.name, icon: area.icon || 'tag', color: area.color, bg: hexToSoftBg(area.color, 0.14) };
  }

  function zoomResetRoot() {
    sounds.click();
    setZoomLifeAreaId(null);
    setZoomYear(null);
    setZoomGoalChainIds([]);
    setZoomMonth(null);
    setZoomWeek(null);
    setZoomDay(null);
  }

  function zoomOpenLifeArea(key: string) {
    sounds.click();
    setZoomLifeAreaId(key);
    setZoomYear(null);
    setZoomGoalChainIds([]);
    setZoomMonth(null);
    setZoomWeek(null);
    setZoomDay(null);
  }

  function zoomOpenYear(y: number) {
    sounds.click();
    setZoomYear(y);
    setZoomGoalChainIds([]);
    setZoomMonth(null);
    setZoomWeek(null);
    setZoomDay(null);
  }

  // فتح هدف (سنوي/شهري/أسبوعي/يومي) بيضيفه لسلسلة الزوم، وبيصفّر أي خانة
  // تقويمية (شهر/أسبوع/يوم) خاصة بالمستوى اللي *تحت* الهدف ده مباشرة —
  // عشان نبدأ اختيار جديد لها من غير ما نسيب قيمة قديمة من مسار سابق.
  // الخانات الخاصة بمستويات *فوقه* (لو موجودة) بتفضل زي ما هي عمدًا عشان
  // تفضل ظاهرة في البريدكرمب.
  function zoomOpenGoal(goal: GoalList) {
    sounds.click();
    setZoomGoalChainIds((chain) => [...chain, goal.id]);
    if (goal.category === 'YEARLY') {
      setZoomMonth(null);
      setZoomWeek(null);
      setZoomDay(null);
    } else if (goal.category === 'MONTHLY') {
      setZoomWeek(null);
      setZoomDay(null);
    } else if (goal.category === 'WEEKLY') {
      setZoomDay(null);
    }
  }

  // اختيار خانة تقويمية (رقم شهر/أسبوع/يوم) من شبكتها الثابتة — من غير ما
  // يتغيّر مسار الأهداف نفسه (السلسلة زي ما هي، بس بنعرض محتوى الخانة دي).
  function zoomSelectMonth(m: number) {
    sounds.click();
    setZoomMonth(m);
  }
  function zoomSelectWeek(w: number) {
    sounds.click();
    setZoomWeek(w);
  }
  function zoomSelectDay(d: number) {
    sounds.click();
    setZoomDay(d);
  }

  function zoomGoToYearLevel() {
    sounds.click();
    setZoomGoalChainIds([]);
    setZoomMonth(null);
    setZoomWeek(null);
    setZoomDay(null);
  }

  // رجوع عام لأي "مرحلة" في المسار — بيقصّ سلسلة الأهداف لطول معيّن،
  // ويسيب/يصفّر كل خانة تقويمية حسب اللي المفروض يفضل ظاهر في البريدكرمب
  // في المرحلة المطلوبة. مستخدمة من كل أزرار البريدكرمب (شوف الاستخدام تحت).
  function zoomGoToStage(chainLen: number, opts: { keepMonth?: boolean; keepWeek?: boolean; keepDay?: boolean } = {}) {
    sounds.click();
    setZoomGoalChainIds((chain) => chain.slice(0, chainLen));
    if (!opts.keepMonth) setZoomMonth(null);
    if (!opts.keepWeek) setZoomWeek(null);
    if (!opts.keepDay) setZoomDay(null);
  }

  // عدد إجمالي للأهداف على كل المستويات تحت أهداف السنة المختارة — بيبان
  // في هيدر السنة كملخّص سريع.
  const yearTotalGoals =
    yearGoalsByLevel.YEARLY.length + yearGoalsByLevel.MONTHLY.length + yearGoalsByLevel.WEEKLY.length + yearGoalsByLevel.DAILY.length;

  return (
    <div className="container view-fade profile-page goal-map-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>خريطة الأهداف</strong>
          <button
            className="icon-btn hamburger-btn"
            onClick={onOpenMenu}
            type="button"
            title="القائمة"
            aria-label="فتح القائمة"
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <span className="hamburger-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <div className="life-area-intro">
        <DynamicIcon name="route" size={28} className="life-area-intro-icon" />
        <div>
          <h1>خريطة الأهداف</h1>
          <p>خطط سنتك من فوق لتحت: سنة ← شهور ← أسابيع ← أيام، وكل مستوى مربوط بالمستوى اللي فوقه تلقائيًا.</p>
        </div>
      </div>

      {/* ===== إحصائية تقدّم السنة (المرحلة 8) ===== */}
      <div className="goal-map-year-stats">
        <div
          className="goal-map-year-stats-ring"
          style={{ ['--stats-percent' as any]: yearProgressStats.percent }}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="goal-map-year-stats-track" cx="50" cy="50" r="42" />
            <circle
              className="goal-map-year-stats-fill"
              cx="50"
              cy="50"
              r="42"
              style={{ strokeDasharray: `${(yearProgressStats.percent / 100) * 263.9} 263.9` }}
            />
          </svg>
          <span className="goal-map-year-stats-percent" dir="ltr">
            {yearProgressStats.percent}٪
          </span>
        </div>
        <div className="goal-map-year-stats-info">
          <strong>تقدّم سنة {selectedYear}</strong>
          <div className="goal-map-year-stats-breakdown">
            <span className="goal-map-year-stats-chip">
              <DynamicIcon name="check-circle" size={12} />
              {yearProgressStats.done}/{yearProgressStats.total} هدف مكتمل
            </span>
            {yearProgressStats.overdue > 0 && (
              <span className="goal-map-year-stats-chip goal-map-year-stats-chip-danger">
                <DynamicIcon name="alert" size={12} />
                {yearProgressStats.overdue} متأخر
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===== أهداف/مهام فاتت من غير إنجاز (المرحلة 7) =====
          بتفضل نشطة (مش مؤرشفة) وبتظهر هنا بشكل لافت أعلى الصفحة، عشان
          المستخدم يراجعها ويعدّل تفاصيلها ويحطها تاني — التعديل (زرار
          القلم) بيمسح العلامة تلقائيًا، لكن يوم الاستريك المخصوم بيفضل
          مخصوم عمدًا. */}
      {overdueGoals.length > 0 && (
        <div className="goal-map-overdue-banner" role="alert">
          <div className="goal-map-overdue-banner-head">
            <DynamicIcon name="alert" size={18} />
            <div>
              <strong>{overdueGoals.length} {overdueGoals.length === 1 ? 'هدف فاتت مدته' : 'أهداف فاتت مدتها'} من غير إنجاز</strong>
              <p>اتخصم يوم استريك عن كل واحد منها. راجعها وعدّل تفاصيلها من هنا مباشرة.</p>
            </div>
          </div>
          <div className="goal-map-overdue-banner-list">
            {overdueGoals.map((g) => (
              <div key={g.id} className="goal-map-overdue-item">
                <span className="goal-map-overdue-item-category">{categoryOf(g.category as CategoryKey)?.label}</span>
                <TodoList
                  list={g}
                  onChange={onChange}
                  onDeleteList={onDeleteList}
                  lifeAreas={lifeAreas}
                  onManageLifeAreas={onManageLifeAreas}
                  compact
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== شريط اختيار السنة ===== */}
      <div className="goal-map-year-bar" role="tablist" aria-label="اختيار سنة">
        {years.map((y) => {
          const count = yearlyGoals.filter((g) => (g.targetYear || CURRENT_YEAR) === y).length;
          return (
            <button
              key={y}
              type="button"
              role="tab"
              aria-selected={selectedYear === y}
              className={`goal-map-year-chip ${selectedYear === y ? 'active' : ''}`}
              onClick={() => handleYearChipClick(y)}
              onPointerDown={() => startYearLongPress(y)}
              onPointerUp={cancelYearLongPress}
              onPointerLeave={cancelYearLongPress}
              onPointerCancel={cancelYearLongPress}
              onContextMenu={(e) => e.preventDefault()}
              title={`اضغط للاختيار — اضغط مطوّلًا للحذف`}
            >
              <DynamicIcon name="calendar-range" size={13} />
              <span dir="ltr">{y}</span>
              {count > 0 && <span className="goal-map-year-chip-count">{count}</span>}
            </button>
          );
        })}

        {!addYearOpen ? (
          <button type="button" className="goal-map-year-chip goal-map-year-chip-add" onClick={openAddYearStepper}>
            <DynamicIcon name="plus" size={13} /> سنة جديدة
          </button>
        ) : (
          <div className="goal-map-year-stepper" role="group" aria-label="اختيار السنة الجديدة">
            <button
              type="button"
              className="goal-map-year-stepper-btn"
              onClick={() => stepYearDraft(-1)}
              disabled={newYearDraft <= CURRENT_YEAR}
              aria-label="سنة أقل"
              title="سنة أقل"
            >
              <DynamicIcon name="minus" size={14} />
            </button>
            <span className="goal-map-year-stepper-value" dir="ltr">
              {newYearDraft}
            </span>
            <button
              type="button"
              className="goal-map-year-stepper-btn"
              onClick={() => stepYearDraft(1)}
              aria-label="سنة أكتر"
              title="سنة أكتر"
            >
              <DynamicIcon name="plus" size={14} />
            </button>
            <button type="button" className="goal-map-year-stepper-confirm" onClick={confirmAddYear}>
              <DynamicIcon name="check" size={13} /> اختيار
            </button>
            <button
              type="button"
              className="goal-map-year-stepper-cancel"
              onClick={() => setAddYearOpen(false)}
              aria-label="إلغاء"
              title="إلغاء"
            >
              <DynamicIcon name="x" size={13} />
            </button>
          </div>
        )}
      </div>

      {confirmDeleteYear != null && (
        <ConfirmModal
          title={`متأكد من حذف سنة ${confirmDeleteYear}؟`}
          description="كل الأهداف والمهام تحت السنة دي (على كل المستويات) هتتنقل لسلة المحذوفات وتفضل قابلة للاسترجاع لمدة 5 أيام، وبعدها بتتحذف نهائيًا."
          confirmLabel="حذف"
          cancelLabel="إلغاء"
          danger
          onCancel={() => setConfirmDeleteYear(null)}
          onConfirm={confirmDeleteYearNow}
        />
      )}

      {/* ===================================================================
          القسم الأول: بناء الخطة — بقى بس زرار واحد "إضافة مهام / أهداف".
          الضغط عليه بيفتح اختيار المستوى (سنوي/شهري/أسبوعي/يومي)، وبعد
          الإضافة بننقّل المستخدم تلقائيًا لمكان الهدف الصح في "خريطة
          العرض الكاملة" تحت — مفيش قائمة مسطّحة هنا خالص دلوقتي.
          =================================================================== */}
      <div className="goal-map-section">
        <div className="goal-map-section-header-row">
          <button
            type="button"
            className="goal-map-section-title goal-map-section-toggle"
            onClick={() => {
              sounds.click();
              setPlanBuilderOpen((v) => !v);
            }}
            aria-expanded={planBuilderOpen}
          >
            <DynamicIcon name="target" size={16} />
            <span className="goal-map-section-toggle-label">
              بناء الخطة
              <span className="goal-map-section-title-year" dir="ltr">{selectedYear}</span>
            </span>
            <DynamicIcon name="chevron-down" size={15} className={`goal-map-section-chevron ${planBuilderOpen ? 'expanded' : ''}`} />
          </button>
        </div>

        {planBuilderOpen && (
          <div className="goal-map-add-launcher">
            <button type="button" className="goal-map-add-launcher-btn" onClick={openAddLevelPicker}>
              <DynamicIcon name="plus" size={18} />
              إضافة مهام / أهداف
            </button>
            <p className="goal-map-add-launcher-hint">
              اختار المستوى، واملأ بيانات الهدف بالتفصيل عشان يترتبط صح بالمكان المناسب له في خريطة العرض الكاملة تحت.
            </p>

            {addLevelPickerOpen && (
              <div
                className="goal-map-level-picker-overlay"
                role="dialog"
                aria-label="اختيار مستوى الهدف"
                onClick={() => {
                  sounds.click();
                  setAddLevelPickerOpen(false);
                }}
              >
                <div className="goal-map-level-picker" onClick={(e) => e.stopPropagation()}>
                  <div className="goal-map-level-picker-head">
                    <strong>هتضيف هدف من أي مستوى؟</strong>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="إغلاق"
                      onClick={() => {
                        sounds.click();
                        setAddLevelPickerOpen(false);
                      }}
                    >
                      <DynamicIcon name="x" size={16} />
                    </button>
                  </div>
                  <div className="goal-map-level-picker-list">
                    {LEVELS.map((level) => {
                      const def = categoryOf(level)!;
                      const disabled = level !== 'YEARLY' && yearGoalsByLevel.YEARLY.length === 0;
                      return (
                        <button
                          key={level}
                          type="button"
                          className="goal-map-level-picker-option"
                          style={{ ['--level-color' as any]: def.color, ['--level-bg' as any]: def.bg } as any}
                          disabled={disabled}
                          onClick={() => openAddForLevel(level)}
                          title={disabled ? 'لازم يكون فيه هدف سنوي الأول' : undefined}
                        >
                          <span className="goal-map-level-picker-option-icon">
                            <DynamicIcon name={def.icon} size={18} />
                          </span>
                          <span className="goal-map-level-picker-option-text">
                            <strong>إضافة {pluralIndefinite(level)}</strong>
                            <span>{def.hint}</span>
                          </span>
                          <DynamicIcon name="chevron-left" size={15} className="goal-map-level-picker-option-chevron" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================================================================
          القسم الثاني: خريطة العرض الكاملة — Zoom Navigation. تصفّح حرّ
          لكل الأهداف بغض النظر عن السنة المختارة فوق في "بناء الخطة"،
          بترتيب: مجال حياة ← سنة ← هدف سنوي ← شهرية ← أسبوعية ← يومية ←
          المهمة نفسها (كارت TodoList الكامل، زي الصفحة الرئيسية بالظبط).
          =================================================================== */}
      {yearlyGoals.length > 0 && (
        <div className="goal-map-section goal-map-tree-section">
          <div className="goal-map-section-header-row">
            <button
              type="button"
              className="goal-map-section-title goal-map-section-toggle"
              onClick={() => {
                sounds.click();
                setTreeOpen((v) => !v);
              }}
              aria-expanded={treeOpen}
            >
              <DynamicIcon name="route" size={16} />
              <span>خريطة العرض الكاملة</span>
              <DynamicIcon name="chevron-down" size={15} className={`goal-map-section-chevron ${treeOpen ? 'expanded' : ''}`} />
            </button>

            {/* ===== فلاتر خريطة العرض (المرحلة 8) ===== */}
            {treeOpen && (
              <div className="goal-map-zoom-filter-wrap">
                <button
                  type="button"
                  className={`goal-map-zoom-filter-btn ${zoomFiltersActiveCount > 0 ? 'active' : ''}`}
                  onClick={() => setZoomFilterOpen((v) => !v)}
                  aria-expanded={zoomFilterOpen}
                  aria-label="فلاتر خريطة العرض"
                  title="فلاتر"
                >
                  <DynamicIcon name="sliders" size={15} />
                  {zoomFiltersActiveCount > 0 && <span className="goal-map-zoom-filter-badge">{zoomFiltersActiveCount}</span>}
                </button>

                {zoomFilterOpen && (
                  <div className="goal-map-zoom-filter-panel" role="dialog" aria-label="فلاتر خريطة العرض">
                    <div className="goal-map-zoom-filter-field">
                      <label>مجال الحياة</label>
                      <select value={zoomFilterLifeArea} onChange={(e) => onZoomFilterLifeAreaChange(e.target.value)}>
                        <option value="all">الكل</option>
                        <option value="none">بدون مجال</option>
                        {lifeAreas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="goal-map-zoom-filter-field">
                      <label>السنة</label>
                      <select
                        value={zoomFilterYear}
                        onChange={(e) => onZoomFilterYearChange(e.target.value)}
                        disabled={zoomLifeAreaId == null}
                      >
                        <option value="all">الكل</option>
                        {zoomYearsInLifeArea.map((y) => (
                          <option key={y} value={y} dir="ltr">
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* فلاتر "الشهر"/"الأسبوع" اتشالت من هنا بعد المرحلة 9 —
                        بقى في تصفّح تقويمي حقيقي (شهر ← أسبوع ← يوم) جوه
                        الخريطة نفسها بدل قفزة عبر قائمة أسماء، شوف تحت. */}

                    <div className="goal-map-zoom-filter-field">
                      <label>الحالة</label>
                      <select value={zoomFilterStatus} onChange={(e) => setZoomFilterStatus(e.target.value as any)}>
                        <option value="all">الكل</option>
                        <option value="pending">لسه</option>
                        <option value="done">مكتمل</option>
                        <option value="overdue">متأخر</option>
                      </select>
                    </div>

                    <div className="goal-map-zoom-filter-field">
                      <label>الأولوية</label>
                      <select value={zoomFilterPriority} onChange={(e) => setZoomFilterPriority(e.target.value as any)}>
                        <option value="all">الكل</option>
                        <option value="CRITICAL">حرجة</option>
                        <option value="HIGH">مرتفعة</option>
                        <option value="MEDIUM">متوسطة</option>
                        <option value="LOW">منخفضة</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      className="goal-map-zoom-filter-clear"
                      onClick={clearZoomFilters}
                      disabled={zoomFiltersActiveCount === 0}
                    >
                      <DynamicIcon name="x" size={13} />
                      مسح الفلتر
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {treeOpen && (
            <>
              {/* بريدكرمب الزوم — بيتابع مكان المستخدم بالظبط، وأي خطوة فيه
                  قابلة للضغط للرجوع لمستوى أعلى فورًا. */}
              <div className="zoom-map-breadcrumb" aria-label="مسار التنقل بالزوم">
                <button
                  type="button"
                  className={`zoom-map-crumb zoom-map-crumb-root ${zoomLifeAreaId == null ? 'current' : ''}`}
                  onClick={zoomResetRoot}
                  disabled={zoomLifeAreaId == null}
                >
                  <DynamicIcon name="home" size={12} /> مجالات الحياة
                </button>
                {zoomLifeAreaId != null && (
                  <span className="zoom-map-crumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="zoom-map-crumb-sep" />
                    <button
                      type="button"
                      className={`zoom-map-crumb ${zoomYear == null ? 'current' : ''}`}
                      onClick={() => {
                        sounds.click();
                        setZoomYear(null);
                        setZoomGoalChainIds([]);
                        setZoomMonth(null);
                        setZoomWeek(null);
                        setZoomDay(null);
                      }}
                      disabled={zoomYear == null}
                    >
                      <DynamicIcon name={lifeAreaMeta(zoomLifeAreaId).icon} size={12} />
                      {lifeAreaMeta(zoomLifeAreaId).title}
                    </button>
                  </span>
                )}
                {zoomYear != null && (
                  <span className="zoom-map-crumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="zoom-map-crumb-sep" />
                    <button
                      type="button"
                      className={`zoom-map-crumb ${zoomGoalChain.length === 0 ? 'current' : ''}`}
                      onClick={zoomGoToYearLevel}
                      disabled={zoomGoalChain.length === 0}
                      dir="ltr"
                    >
                      {zoomYear}
                    </button>
                  </span>
                )}
                {/* هدف سنوي — أول عنصر في السلسلة. الدوسة عليه بترجّعنا
                    لشبكة الأشهر (بتصفّر الشهر/الأسبوع/اليوم كمان). */}
                {zoomAnnualGoal && (
                  <span className="zoom-map-crumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="zoom-map-crumb-sep" />
                    <button
                      type="button"
                      className={`zoom-map-crumb ${zoomGoalChain.length === 1 && zoomMonth == null ? 'current' : ''}`}
                      onClick={() => zoomGoToStage(1)}
                      disabled={zoomGoalChain.length === 1 && zoomMonth == null}
                      title={zoomAnnualGoal.title}
                    >
                      {zoomAnnualGoal.title}
                    </button>
                  </span>
                )}
                {/* الشهر المختار (رقمه واسمه) — بترجّع لقائمة الأهداف
                    الشهرية في الشهر ده (بتصفّر الأسبوع/اليوم). */}
                {zoomMonth != null && (
                  <span className="zoom-map-crumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="zoom-map-crumb-sep" />
                    <button
                      type="button"
                      className={`zoom-map-crumb ${zoomGoalChain.length === 1 ? 'current' : ''}`}
                      onClick={() => zoomGoToStage(1, { keepMonth: true })}
                      disabled={zoomGoalChain.length === 1}
                    >
                      <span dir="ltr">{zoomMonth}</span> — {MONTH_NAMES[zoomMonth - 1]}
                    </button>
                  </span>
                )}
                {zoomMonthlyGoal && (
                  <span className="zoom-map-crumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="zoom-map-crumb-sep" />
                    <button
                      type="button"
                      className={`zoom-map-crumb ${zoomGoalChain.length === 2 && zoomWeek == null ? 'current' : ''}`}
                      onClick={() => zoomGoToStage(2, { keepMonth: true })}
                      disabled={zoomGoalChain.length === 2 && zoomWeek == null}
                      title={zoomMonthlyGoal.title}
                    >
                      {zoomMonthlyGoal.title}
                    </button>
                  </span>
                )}
                {/* الأسبوع المختار جوه الشهر — بترجّع لقائمة الأهداف
                    الأسبوعية في الأسبوع ده (بتصفّر اليوم). */}
                {zoomWeek != null && (
                  <span className="zoom-map-crumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="zoom-map-crumb-sep" />
                    <button
                      type="button"
                      className={`zoom-map-crumb ${zoomGoalChain.length === 2 ? 'current' : ''}`}
                      onClick={() => zoomGoToStage(2, { keepMonth: true, keepWeek: true })}
                      disabled={zoomGoalChain.length === 2}
                    >
                      {WEEK_LABELS[zoomWeek - 1]}
                    </button>
                  </span>
                )}
                {zoomWeeklyGoal && (
                  <span className="zoom-map-crumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="zoom-map-crumb-sep" />
                    <button
                      type="button"
                      className={`zoom-map-crumb ${zoomGoalChain.length === 3 && zoomDay == null ? 'current' : ''}`}
                      onClick={() => zoomGoToStage(3, { keepMonth: true, keepWeek: true })}
                      disabled={zoomGoalChain.length === 3 && zoomDay == null}
                      title={zoomWeeklyGoal.title}
                    >
                      {zoomWeeklyGoal.title}
                    </button>
                  </span>
                )}
                {/* يوم الأسبوع المختار — بترجّع لقائمة الأهداف اليومية في
                    اليوم ده. */}
                {zoomDay != null && (
                  <span className="zoom-map-crumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="zoom-map-crumb-sep" />
                    <button
                      type="button"
                      className={`zoom-map-crumb ${zoomGoalChain.length === 3 ? 'current' : ''}`}
                      onClick={() => zoomGoToStage(3, { keepMonth: true, keepWeek: true, keepDay: true })}
                      disabled={zoomGoalChain.length === 3}
                    >
                      {DAY_OF_WEEK_NAMES[zoomDay]}
                    </button>
                  </span>
                )}
                {zoomDailyGoal && (
                  <span className="zoom-map-crumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="zoom-map-crumb-sep" />
                    <button type="button" className="zoom-map-crumb current" disabled title={zoomDailyGoal.title}>
                      {zoomDailyGoal.title}
                    </button>
                  </span>
                )}
              </div>

              {/* محتوى المستوى الحالي: مجلدات (كل مستوى قبل المهمة) أو كارت
                  المهمة الكامل نفسه (لما نوصل لهدف يومي). */}
              {zoomLifeAreaId == null ? (
                <ZoomFolderGrid
                  emptyLabel="لسه مفيش أهداف سنوية اتضافت. ابدأ من قسم بناء الخطة فوق."
                  items={Array.from(zoomLifeAreaBuckets.entries()).map(([key, goals]) => {
                    const meta = lifeAreaMeta(key);
                    const ratio = goalsDoneRatio(goals);
                    return {
                      key,
                      title: meta.title,
                      icon: meta.icon,
                      color: meta.color,
                      bg: meta.bg,
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomOpenLifeArea(key),
                    };
                  })}
                />
              ) : zoomYear == null ? (
                <ZoomFolderGrid
                  emptyLabel="لسه مفيش سنوات فيها أهداف في المجال ده."
                  items={zoomYearsInLifeArea.map((y) => {
                    const goals = (zoomLifeAreaBuckets.get(zoomLifeAreaId) || []).filter((g) => (g.targetYear || CURRENT_YEAR) === y);
                    const ratio = goalsDoneRatio(goals);
                    return {
                      key: String(y),
                      title: String(y),
                      icon: 'calendar-range',
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomOpenYear(y),
                    };
                  })}
                />
              ) : zoomGoalChain.length === 0 ? (
                <ZoomFolderGrid
                  emptyLabel={`لسه مفيش أهداف سنوية في سنة ${zoomYear} لهذا المجال.`}
                  items={zoomYearlyGoals.map((g) => {
                    const children = lists.filter((l) => l.parentGoalId === g.id);
                    const ratio = goalsDoneRatio(children);
                    const def = categoryOf('YEARLY')!;
                    const isDone = !!g.confirmedDone;
                    return {
                      key: g.id,
                      title: g.title,
                      icon: isDone ? 'check-circle' : def.icon,
                      color: def.color,
                      bg: def.bg,
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomOpenGoal(g),
                      goal: g,
                    };
                  })}
                  onEditGoal={openEditGoal}
                  onGoalLongPressStart={startGoalLongPress}
                  onGoalLongPressEnd={cancelGoalLongPress}
                  longPressFiredRef={goalLongPressFiredRef}
                  pressingGoalId={pressingGoalId}
                />
              ) : zoomGoalChain.length === 1 && zoomMonth == null ? (
                // ===== شبكة شهور السنة (12 شهر بأرقامهم) تحت الهدف السنوي
                // المختار — كل شهر بيعرض الأهداف الشهرية المرتبطة بيه. =====
                <ZoomFolderGrid
                  density="months"
                  emptyLabel="لسه مفيش أهداف شهرية مضافة في أي شهر — أضفها من قسم بناء الخطة فوق."
                  items={MONTH_NAMES.map((name, idx) => {
                    const m = idx + 1;
                    const monthGoals = zoomMonthlyGoalsInYear.filter((g) => (g.targetMonth || null) === m);
                    const ratio = goalsDoneRatio(monthGoals);
                    return {
                      key: String(m),
                      title: name,
                      badge: String(m),
                      icon: 'calendar-range',
                      calendar: true,
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomSelectMonth(m),
                    };
                  }).filter((it) => it.totalCount > 0)}
                />
              ) : zoomGoalChain.length === 1 ? (
                // ===== الأهداف الشهرية المرتبطة بالهدف السنوي المحدد في
                // الشهر المختار. =====
                <ZoomFolderGrid
                  emptyLabel={`لسه مفيش أهداف شهرية في شهر ${zoomMonth} — ${MONTH_NAMES[(zoomMonth || 1) - 1]}.`}
                  items={zoomMonthlyGoalsForSelectedMonth.map((g) => {
                    const def = categoryOf('MONTHLY')!;
                    const isDone = !!g.confirmedDone;
                    const children = lists.filter((l) => l.parentGoalId === g.id);
                    const ratio = goalsDoneRatio(children);
                    return {
                      key: g.id,
                      title: g.title,
                      icon: isDone ? 'check-circle' : def.icon,
                      color: def.color,
                      bg: def.bg,
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomOpenGoal(g),
                      goal: g,
                    };
                  })}
                  onEditGoal={openEditGoal}
                  onGoalLongPressStart={startGoalLongPress}
                  onGoalLongPressEnd={cancelGoalLongPress}
                  longPressFiredRef={goalLongPressFiredRef}
                  pressingGoalId={pressingGoalId}
                />
              ) : zoomGoalChain.length === 2 && zoomWeek == null ? (
                // ===== "مربع الأسابيع" جوه الشهر المختار — أسابيع الهدف
                // الشهري المحدد (5 أسابيع ثابتة)، كل أسبوع بيعرض الأهداف
                // الأسبوعية المرتبطة بيه. =====
                <ZoomFolderGrid
                  density="weeks"
                  emptyLabel="لسه مفيش أهداف أسبوعية مضافة في أي أسبوع من الشهر ده — أضفها من قسم بناء الخطة فوق."
                  items={WEEK_LABELS.map((label, idx) => {
                    const w = idx + 1;
                    const weekGoals = zoomWeeklyGoalsInMonth.filter((g) => (g.targetWeek || null) === w);
                    const ratio = goalsDoneRatio(weekGoals);
                    return {
                      key: String(w),
                      title: label,
                      badge: String(w),
                      icon: 'calendar-days',
                      calendar: true,
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomSelectWeek(w),
                    };
                  }).filter((it) => it.totalCount > 0)}
                />
              ) : zoomGoalChain.length === 2 ? (
                // ===== الأهداف الأسبوعية المرتبطة بالهدف الشهري المحدد في
                // الأسبوع المختار. =====
                <ZoomFolderGrid
                  emptyLabel={`لسه مفيش أهداف أسبوعية في ${WEEK_LABELS[(zoomWeek || 1) - 1]}.`}
                  items={zoomWeeklyGoalsForSelectedWeek.map((g) => {
                    const def = categoryOf('WEEKLY')!;
                    const isDone = !!g.confirmedDone;
                    const children = lists.filter((l) => l.parentGoalId === g.id);
                    const ratio = goalsDoneRatio(children);
                    return {
                      key: g.id,
                      title: g.title,
                      icon: isDone ? 'check-circle' : def.icon,
                      color: def.color,
                      bg: def.bg,
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomOpenGoal(g),
                      goal: g,
                    };
                  })}
                  onEditGoal={openEditGoal}
                  onGoalLongPressStart={startGoalLongPress}
                  onGoalLongPressEnd={cancelGoalLongPress}
                  longPressFiredRef={goalLongPressFiredRef}
                  pressingGoalId={pressingGoalId}
                />
              ) : zoomGoalChain.length === 3 && zoomDay == null ? (
                // ===== جميع أيام الأسبوع المختار (7 أيام ثابتة) — كل يوم
                // بيعرض الأهداف اليومية المرتبطة بالهدف الأسبوعي المحدد. =====
                <ZoomFolderGrid
                  density="days"
                  emptyLabel="لسه مفيش أهداف يومية مضافة في أي يوم من الأسبوع ده — أضفها من قسم بناء الخطة فوق."
                  items={DAY_OF_WEEK_NAMES.map((name, d) => {
                    const dayGoals = zoomDailyGoalsInWeek.filter((g) => (g.targetDayOfWeek ?? null) === d);
                    const ratio = goalsDoneRatio(dayGoals);
                    return {
                      key: String(d),
                      title: name,
                      icon: 'calendar',
                      calendar: true,
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomSelectDay(d),
                    };
                  }).filter((it) => it.totalCount > 0)}
                />
              ) : zoomGoalChain.length === 3 ? (
                // ===== الأهداف اليومية المرتبطة بالهدف الأسبوعي المحدد في
                // اليوم المختار — الدوسة على أي هدف بيفتح كارت المهمة الكامل. =====
                <ZoomFolderGrid
                  emptyLabel={`لسه مفيش أهداف يومية يوم ${DAY_OF_WEEK_NAMES[zoomDay || 0]}.`}
                  items={zoomDailyGoalsForSelectedDay.map((g) => {
                    const def = categoryOf('DAILY')!;
                    const isDone = !!g.confirmedDone;
                    const ratio = { done: g.items.filter((i: any) => i.isDone).length, total: g.items.length };
                    return {
                      key: g.id,
                      title: g.title,
                      icon: isDone ? 'check-circle' : def.icon,
                      color: def.color,
                      bg: def.bg,
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomOpenGoal(g),
                      goal: g,
                    };
                  })}
                  onEditGoal={openEditGoal}
                  onGoalLongPressStart={startGoalLongPress}
                  onGoalLongPressEnd={cancelGoalLongPress}
                  longPressFiredRef={goalLongPressFiredRef}
                  pressingGoalId={pressingGoalId}
                />
              ) : (
                // ===== المستوى النهائي: كارت المهمة اليومية الكاملة، زي
                // الصفحة الرئيسية بالظبط. =====
                <div className="zoom-map-final-goal">
                  <TodoList
                    list={zoomDailyGoal!}
                    onChange={onChange}
                    onDeleteList={onDeleteList}
                    lifeAreas={lifeAreas}
                    onManageLifeAreas={onManageLifeAreas}
                    onCreateSubGoal={handleCreateAndNavigate}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ===== المرحلة الأولى من حذف هدف بتبعياته: تأكيد عادي بيوضّح بالظبط
          كام هدف فرعي (شهري/أسبوعي/يومي) هيتحذف معاه. ===== */}
      {cascadeDeleteCandidate && (() => {
        const counts = cascadeChildCounts(cascadeDeleteCandidate.id);
        const parts: string[] = [];
        if (counts.MONTHLY > 0) parts.push(`${counts.MONTHLY} هدف شهري`);
        if (counts.WEEKLY > 0) parts.push(`${counts.WEEKLY} هدف أسبوعي`);
        if (counts.DAILY > 0) parts.push(`${counts.DAILY} هدف يومي`);
        const description =
          parts.length > 0
            ? `هيتحذف الهدف "${cascadeDeleteCandidate.title}" نهائيًا مع كل تبعياته: ${parts.join('، ')}، وكل المهام الفرعية والتذكيرات المرتبطة بيهم كلهم. الإجراء ده مينفعش يترجع.`
            : `هيتحذف الهدف "${cascadeDeleteCandidate.title}" نهائيًا مع كل مهامه الفرعية وتذكيراته. الإجراء ده مينفعش يترجع.`;
        return (
          <ConfirmModal
            title="متأكد من حذف الهدف ده؟"
            description={description}
            confirmLabel="متابعة الحذف"
            cancelLabel="إلغاء"
            danger
            onCancel={() => setCascadeDeleteCandidate(null)}
            onConfirm={() => {
              setCascadePasswordFor(cascadeDeleteCandidate);
              setCascadeDeleteCandidate(null);
            }}
          />
        );
      })()}

      {/* ===== المرحلة الثانية: تأكيد أخير بكلمة مرور الحساب قبل التنفيذ
          الفعلي — شوف AccountPasswordConfirmModal.tsx وlib/api.ts
          (deleteListCascade). ===== */}
      {cascadePasswordFor && (
        <AccountPasswordConfirmModal
          title={`حذف "${cascadePasswordFor.title}" نهائيًا`}
          description="الإجراء ده نهائي ومينفعش يترجع — اكتب كلمة مرور حسابك للتأكيد."
          confirmLabel="حذف نهائيًا"
          onCancel={() => setCascadePasswordFor(null)}
          onConfirm={confirmCascadeDeleteNow}
        />
      )}

      {/* ===== تعديل هدف مباشرة من كارته (زرار القلم) — نفس ويزارد
          الإنشاء بس في وضع تعديل. ===== */}
      {editGoal && (
        <Suspense fallback={null}>
          <AddTaskModal
            open={!!editGoal}
            lifeAreas={lifeAreas}
            onClose={() => setEditGoal(null)}
            onManageLifeAreas={onManageLifeAreas}
            editTarget={{
              id: editGoal.id,
              title: editGoal.title,
              priority: (editGoal.priority || 'MEDIUM') as any,
              category: (editGoal.category ?? null) as CategoryKey | null,
              targetYear: editGoal.targetYear ?? null,
              targetMonth: editGoal.targetMonth ?? null,
              targetWeek: editGoal.targetWeek ?? null,
              targetDayOfWeek: editGoal.targetDayOfWeek ?? null,
              lifeAreaId: editGoal.lifeArea?.id ?? editGoal.lifeAreaId ?? null,
              parentGoalId: editGoal.parentGoal?.id ?? editGoal.parentGoalId ?? null,
              startTime: editGoal.startTime ?? null,
              endTime: editGoal.endTime ?? null,
              subtasks: [...(editGoal.items || [])]
                .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
                .map((it: any) => ({ id: it.id, content: it.content })),
              reminders: editGoalReminders,
            }}
            onSave={async (id, data) => {
              await handleEditGoalSave(id, data);
              setEditGoal(null);
            }}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <AddTaskModal
          open={addModal.open}
          lifeAreas={lifeAreas}
          onClose={() => setAddModal((m) => ({ ...m, open: false }))}
          onManageLifeAreas={() => {
            setAddModal((m) => ({ ...m, open: false }));
            onManageLifeAreas();
          }}
          onCreate={handleCreateAndNavigate}
          onLifeAreaCreated={onLifeAreaCreated}
          presetCategory={addModal.category}
          presetTargetYear={addModal.category === 'YEARLY' ? selectedYear : null}
          presetParentGoal={addModal.parent}
        />
      </Suspense>
    </div>
  );
}
