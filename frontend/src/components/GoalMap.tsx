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
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';
import { CategoryKey, CHILD_CATEGORY_OF, categoryOf, MONTH_NAMES, WEEK_LABELS, DAY_OF_WEEK_NAMES } from '../lib/category';
import { LifeAreaData, hexToSoftBg } from '../lib/lifeArea';
import type { NewTaskPayload } from './AddTaskModal';
import type { GoalOption, TrashedYear } from '../lib/api';
import { getTrash, trashYear as trashYearApi, restoreTrashedYear } from '../lib/api';
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

// تسميات عربية صحيحة نحويًا حسب السياق — "هدف شهري" (نكرة مفرد، لزرار
// "+ جديد")، "أهداف شهرية" (نكرة جمع، لجمل زي "لسه مفيش...")، "الأهداف
// الشهرية" (معرفة جمع، لعناوين الأقسام والتبويبات).
const SINGULAR_INDEFINITE_LABEL: Record<CategoryKey, string> = {
  YEARLY: 'هدف سنوي',
  MONTHLY: 'هدف شهري',
  WEEKLY: 'هدف أسبوعي',
  DAILY: 'هدف يومي',
};

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
}

function ZoomFolderGrid({ items, emptyLabel }: { items: ZoomFolderItem[]; emptyLabel: string }) {
  if (items.length === 0) {
    return (
      <div className="zoom-map-empty">
        <DynamicIcon name="folder-open" size={26} className="empty-icon" />
        <p>{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="zoom-map-grid">
      {items.map((it) => {
        const percent = it.totalCount === 0 ? 0 : Math.round((it.doneCount / it.totalCount) * 100);
        // دائرة إنجاز (المرحلة 7): لما كل أبناء المجلد ده يخلصوا، بنستبدل
        // شريط التقدّم بحلقة/شارة "خلص" واضحة بدل النسبة — نفس فكرة الصح
        // الأخضر على مستوى الكارت المنفرد بس على مستوى المجلد كله.
        const isFullyComplete = it.totalCount > 0 && it.doneCount === it.totalCount;
        return (
          <button
            key={it.key}
            type="button"
            className={`zoom-folder-card ${isFullyComplete ? 'zoom-folder-card-complete' : ''}`}
            style={it.color ? ({ ['--zoom-color' as any]: it.color, ['--zoom-bg' as any]: it.bg } as any) : undefined}
            onClick={it.onOpen}
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
        );
      })}
    </div>
  );
}

// كارت هدف واحد في "بناء الخطة" (العرض المسطّح): نفس كارت TodoList
// المعتاد + شريط سفلي مخصوص هنا بيعرض عدد الأهداف الفرعية المباشرة
// وزرار "استعراض" ينقّل المستخدم للمستوى اللي تحته وهو واقف على نفس الهدف
// ده كأب (breadcrumb بيتابعه تلقائيًا لأنه بيتحسب من `focusGoalId`).
function LevelGoalCard({
  goal,
  childCount,
  childDef,
  onDrillIn,
  lifeAreas,
  onChange,
  onDeleteList,
  onManageLifeAreas,
  onCreateSubGoal,
  onGoToParent,
  highlighted,
}: {
  goal: GoalList;
  childCount: number;
  childDef: ReturnType<typeof categoryOf>;
  onDrillIn: (goal: GoalList) => void;
  lifeAreas: LifeAreaData[];
  onChange: () => void;
  onDeleteList: (id: string) => void;
  onManageLifeAreas: () => void;
  onCreateSubGoal: (data: NewTaskPayload) => Promise<void> | void;
  onGoToParent: (parent: { id: string; category: string | null; targetYear?: number | null }) => void;
  highlighted?: boolean;
}) {
  return (
    <div className="level-goal-card">
      <TodoList
        list={goal}
        onChange={onChange}
        onDeleteList={onDeleteList}
        lifeAreas={lifeAreas}
        onManageLifeAreas={onManageLifeAreas}
        onCreateSubGoal={onCreateSubGoal}
        onGoToParent={onGoToParent}
        highlighted={highlighted}
        compact
      />
      {childDef && (
        <button type="button" className="level-goal-card-drill" onClick={() => onDrillIn(goal)}>
          <span className="level-goal-card-drill-text">
            {childCount > 0 ? (
              <>
                استعراض الأهداف ال{childDef.label}
                <span className="level-goal-card-drill-count">{childCount}</span>
              </>
            ) : (
              <>ابدأ إضافة أهداف {childDef.label} تحت الهدف ده</>
            )}
          </span>
          <DynamicIcon name="chevron-left" size={15} />
        </button>
      )}
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

  // ===== تبويبات "بناء الخطة": مستوى حالي (سنوي/شهري/أسبوعي/يومي) + هدف
  // "مُركَّز عليه" (focus) بنستعرض أهداف فرعية بتاعته بس. لما مفيش focus،
  // بنعرض كل أهداف المستوى ده في السنة كلها مجمّعة. =====
  const [activeLevel, setActiveLevel] = useState<CategoryKey>('YEARLY');
  const [focusGoalId, setFocusGoalId] = useState<string | null>(null);

  // لما المستخدم يغيّر السنة، نرجّع نبدأ من الأول (المستوى السنوي، بدون
  // تركيز) — أوضح للعقل من إنه يفضل واقف في مكان عميق من سنة مختلفة.
  useEffect(() => {
    setActiveLevel('YEARLY');
    setFocusGoalId(null);
  }, [selectedYear]);

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

  const focusGoal = useMemo(
    () => (focusGoalId ? lists.find((l) => l.id === focusGoalId) || null : null),
    [lists, focusGoalId]
  );

  // مسار البريدكرمب: من الهدف السنوي الجد لحد الهدف المُركَّز عليه حاليًا،
  // متبني بالصعود من focusGoal عبر parentGoalId لحد ما نوصل لهدف مالوش أب.
  const breadcrumbChain = useMemo(() => {
    if (!focusGoal) return [] as GoalList[];
    const chain: GoalList[] = [focusGoal];
    let current: GoalList = focusGoal;
    while (current.parentGoalId) {
      const parent = lists.find((l) => l.id === current.parentGoalId);
      if (!parent) break;
      chain.unshift(parent);
      current = parent;
    }
    return chain;
  }, [focusGoal, lists]);

  // الأهداف المعروضة فعليًا في المستوى الحالي: لو في تركيز على هدف معيّن،
  // بس أبناؤه المباشرين؛ غير كده كل أهداف المستوى ده في السنة كلها.
  const levelItems = useMemo(() => {
    if (activeLevel === 'YEARLY') return yearGoalsForSelected;
    if (focusGoal) return lists.filter((l) => l.parentGoalId === focusGoal.id);
    return yearGoalsByLevel[activeLevel];
  }, [activeLevel, focusGoal, lists, yearGoalsForSelected, yearGoalsByLevel]);

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

  function selectLevel(level: CategoryKey) {
    sounds.click();
    setActiveLevel(level);
    setFocusGoalId(null);
  }

  function drillInto(goal: GoalList) {
    const childCategory = goal.category ? CHILD_CATEGORY_OF[goal.category as CategoryKey] : null;
    if (!childCategory) return;
    sounds.click();
    setActiveLevel(childCategory);
    setFocusGoalId(goal.id);
  }

  function goToBreadcrumb(goal: GoalList) {
    const childCategory = goal.category ? CHILD_CATEGORY_OF[goal.category as CategoryKey] : null;
    if (!childCategory) return;
    sounds.click();
    setActiveLevel(childCategory);
    setFocusGoalId(goal.id);
  }

  function clearFocus() {
    sounds.click();
    setFocusGoalId(null);
  }

  // ===== نافذة إضافة هدف من هيدر القسم (مش من جوه كارت هدف موجود) =====
  // بتتفتح بإعداد مختلف حسب المكان اللي المستخدم واقف فيه:
  // - في تبويب "سنوية": تصنيف سنوي + السنة المختارة جاهزين.
  // - في تبويب تاني وفيه تركيز على هدف: الهدف الأب جاهز ومربوط تلقائيًا.
  // - في تبويب تاني بدون تركيز: بس التصنيف جاهز، والمستخدم يختار الهدف
  //   الأب بنفسه من خطوة "الهدف الأب" في الويزارد (زي ما هي أصلًا).
  const [addModal, setAddModal] = useState<{ open: boolean; category: CategoryKey | null; parent: GoalOption | null }>(
    { open: false, category: null, parent: null }
  );

  function openSectionAdd() {
    sounds.click();
    if (activeLevel === 'YEARLY') {
      setAddModal({ open: true, category: 'YEARLY', parent: null });
      return;
    }
    if (focusGoal) {
      setAddModal({
        open: true,
        category: null,
        parent: {
          id: focusGoal.id,
          title: focusGoal.title,
          category: focusGoal.category ?? null,
          targetYear: focusGoal.targetYear ?? null,
        },
      });
      return;
    }
    setAddModal({ open: true, category: activeLevel, parent: null });
  }

  // ===== أيقونة الترابط في الكارت المبسّط: تنقّل فعلي للهدف الأب =====
  // بتتنادى لما المستخدم يضغط "افتح" جوه popover أيقونة الترابط في كارت
  // مبسّط (TodoList compact). بتنقّل التبويب النشط لمستوى الهدف الأب،
  // وتحطّ التركيز (focus) على *جد* الهدف الأب (أبو أبوه) عشان الهدف الأب
  // نفسه يبان في قائمة إخوته بدل ما يتفتح على أبنائه — يعني "شوف الهدف
  // ده مكانه فين" مش "ادخل جواه". وبعدين بنعمل تمييز بصري مؤقت + سكرول
  // للكارت بتاعه عشان يبان واضح وسط باقي الكروت.
  const [highlightedGoalId, setHighlightedGoalId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function goToParentGoal(parent: { id: string; category: string | null; targetYear?: number | null }) {
    sounds.click();
    setPlanBuilderOpen(true);
    if (parent.category === 'YEARLY') {
      setActiveLevel('YEARLY');
      setFocusGoalId(null);
    } else if (parent.category) {
      const full = lists.find((l) => l.id === parent.id);
      setActiveLevel(parent.category as CategoryKey);
      setFocusGoalId(full?.parentGoalId ?? null);
    }
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedGoalId(parent.id);
    highlightTimerRef.current = setTimeout(() => setHighlightedGoalId(null), 2200);
    // بنستنى فريم عشان القائمة الجديدة تترندر الأول قبل ما نحاول نلاقي الكارت.
    window.setTimeout(() => {
      document.getElementById(`list-${parent.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  // ===== طيّ/فتح قسم "بناء الخطة" بالكامل (تبويبات + بريدكرمب + محتوى) =====
  const [planBuilderOpen, setPlanBuilderOpen] = useState(true);

  // ===== قسم "خريطة العرض الكاملة" (Zoom Navigation) — قابل للطي/الفتح. =====
  const [treeOpen, setTreeOpen] = useState(true);

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

  const activeLevelDef = categoryOf(activeLevel)!;
  const activeChildCategory = CHILD_CATEGORY_OF[activeLevel] || null;

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
          القسم الأول: بناء الخطة — تبويبات مستوى مسطّحة وسهلة التنقل.
          قابل للطي/الفتح بالكامل (تبويبات + بريدكرمب + محتوى المستوى).
          =================================================================== */}
      <div className="goal-map-section">
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

        {planBuilderOpen && (
          <>
            {/* تبويبات المستوى الأربعة */}
            <div className="level-tab-bar" role="tablist" aria-label="اختيار مستوى الأهداف">
              {LEVELS.map((level) => {
                const def = categoryOf(level)!;
                const count = yearGoalsByLevel[level].length;
                const disabled = level !== 'YEARLY' && yearGoalsByLevel.YEARLY.length === 0;
                const active = activeLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={disabled}
                    className={`level-tab ${active ? 'active' : ''}`}
                    style={active ? { ['--level-color' as any]: def.color, ['--level-bg' as any]: def.bg } : undefined}
                    onClick={() => selectLevel(level)}
                    title={disabled ? 'لازم يكون فيه هدف سنوي الأول' : `الأهداف ال${def.label}`}
                  >
                    <DynamicIcon name={def.icon} size={14} />
                    <span>الأهداف ال{def.label}</span>
                    {count > 0 && <span className="level-tab-count">{count}</span>}
                  </button>
                );
              })}
            </div>

            {/* بريدكرمب المسار الحالي، بيبان بس لو فيه تركيز على هدف معيّن */}
            {breadcrumbChain.length > 0 && (
              <div className="level-breadcrumb" aria-label="مسار التنقل الحالي">
                <button type="button" className="level-breadcrumb-crumb level-breadcrumb-root" onClick={clearFocus}>
                  <DynamicIcon name="calendar-range" size={12} />
                  <span dir="ltr">{selectedYear}</span>
                </button>
                {breadcrumbChain.map((goal) => (
                  <span key={goal.id} className="level-breadcrumb-item">
                    <DynamicIcon name="chevron-left" size={11} className="level-breadcrumb-sep" />
                    <button
                      type="button"
                      className={`level-breadcrumb-crumb ${goal.id === focusGoalId ? 'current' : ''}`}
                      onClick={() => goToBreadcrumb(goal)}
                      disabled={goal.id === focusGoalId}
                      title={goal.title}
                    >
                      {goal.title}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* محتوى المستوى: حاوية عرض واحدة بسيطة — إما قائمة الكروت أو
                رسالة الحالة الفاضية، وتحتها زرار إضافة واحد بس (مفيش تكرار). */}
            <div className="level-content-box">
              {levelItems.length === 0 ? (
                <div className="goal-map-empty level-empty">
                  <DynamicIcon
                    name={activeLevel === 'YEARLY' ? 'flag' : (activeLevelDef.icon as any)}
                    size={28}
                    className="empty-icon"
                  />
                  <p>
                    {activeLevel === 'YEARLY'
                      ? `ابدأ بتحديد أهم حاجة عايز تحققها في سنة ${selectedYear}، وبعدين هنساعدك تقسمها لخطوات شهرية وأسبوعية ويومية واضحة.`
                      : focusGoal
                        ? `لسه مفيش ${pluralIndefinite(activeLevel)} تحت "${focusGoal.title}" — ابدأ بإضافة أول واحد.`
                        : yearGoalsByLevel.YEARLY.length === 0
                          ? 'لازم تضيف هدف سنوي الأول قبل ما تقدر تضيف أهداف تحته.'
                          : `لسه مفيش ${pluralIndefinite(activeLevel)} في سنة ${selectedYear} — تقدر تضيفه من هنا وتختار الهدف الأب بنفسك.`}
                  </p>
                </div>
              ) : (
                <div className="level-goal-grid">
                  {levelItems.map((goal) => (
                    <LevelGoalCard
                      key={goal.id}
                      goal={goal}
                      childCount={lists.filter((l) => l.parentGoalId === goal.id).length}
                      childDef={activeChildCategory ? categoryOf(activeChildCategory) : null}
                      onDrillIn={drillInto}
                      lifeAreas={lifeAreas}
                      onChange={onChange}
                      onDeleteList={onDeleteList}
                      onManageLifeAreas={onManageLifeAreas}
                      onCreateSubGoal={onCreateGoal}
                      onGoToParent={goToParentGoal}
                      highlighted={goal.id === highlightedGoalId}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="level-content-add-btn-bottom"
              onClick={openSectionAdd}
              disabled={activeLevel !== 'YEARLY' && yearGoalsByLevel.YEARLY.length === 0}
            >
              <DynamicIcon name="plus" size={15} /> {SINGULAR_INDEFINITE_LABEL[activeLevel]} جديد
            </button>
          </>
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
                    };
                  })}
                />
              ) : zoomGoalChain.length === 1 && zoomMonth == null ? (
                // ===== شبكة شهور السنة (12 شهر بأرقامهم) تحت الهدف السنوي
                // المختار — كل شهر بيعرض الأهداف الشهرية المرتبطة بيه. =====
                <ZoomFolderGrid
                  emptyLabel="اختر شهر عشان تشوف/تضيف أهدافه."
                  items={MONTH_NAMES.map((name, idx) => {
                    const m = idx + 1;
                    const monthGoals = zoomMonthlyGoalsInYear.filter((g) => (g.targetMonth || null) === m);
                    const ratio = goalsDoneRatio(monthGoals);
                    return {
                      key: String(m),
                      title: `${m} — ${name}`,
                      icon: 'calendar-range',
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomSelectMonth(m),
                    };
                  })}
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
                    };
                  })}
                />
              ) : zoomGoalChain.length === 2 && zoomWeek == null ? (
                // ===== "مربع الأسابيع" جوه الشهر المختار — أسابيع الهدف
                // الشهري المحدد (5 أسابيع ثابتة)، كل أسبوع بيعرض الأهداف
                // الأسبوعية المرتبطة بيه. =====
                <ZoomFolderGrid
                  emptyLabel="اختر أسبوع عشان تشوف/تضيف أهدافه."
                  items={WEEK_LABELS.map((label, idx) => {
                    const w = idx + 1;
                    const weekGoals = zoomWeeklyGoalsInMonth.filter((g) => (g.targetWeek || null) === w);
                    const ratio = goalsDoneRatio(weekGoals);
                    return {
                      key: String(w),
                      title: `${w} — ${label}`,
                      icon: 'calendar-days',
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomSelectWeek(w),
                    };
                  })}
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
                    };
                  })}
                />
              ) : zoomGoalChain.length === 3 && zoomDay == null ? (
                // ===== جميع أيام الأسبوع المختار (7 أيام ثابتة) — كل يوم
                // بيعرض الأهداف اليومية المرتبطة بالهدف الأسبوعي المحدد. =====
                <ZoomFolderGrid
                  emptyLabel="اختر يوم عشان تشوف/تضيف أهدافه."
                  items={DAY_OF_WEEK_NAMES.map((name, d) => {
                    const dayGoals = zoomDailyGoalsInWeek.filter((g) => (g.targetDayOfWeek ?? null) === d);
                    const ratio = goalsDoneRatio(dayGoals);
                    return {
                      key: String(d),
                      title: name,
                      icon: 'calendar',
                      doneCount: ratio.done,
                      totalCount: ratio.total,
                      onOpen: () => zoomSelectDay(d),
                    };
                  })}
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
                    };
                  })}
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
                    onCreateSubGoal={onCreateGoal}
                  />
                </div>
              )}
            </>
          )}
        </div>
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
          onCreate={onCreateGoal}
          onLifeAreaCreated={onLifeAreaCreated}
          presetCategory={addModal.category}
          presetTargetYear={addModal.category === 'YEARLY' ? selectedYear : null}
          presetParentGoal={addModal.parent}
        />
      </Suspense>
    </div>
  );
}
