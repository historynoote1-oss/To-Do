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

import { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import TodoList from './TodoList';
import BackButton from './BackButton';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';
import { CategoryKey, CHILD_CATEGORY_OF, categoryOf } from '../lib/category';
import { LifeAreaData } from '../lib/lifeArea';
import type { NewTaskPayload } from './AddTaskModal';
import type { GoalOption } from '../lib/api';

const AddTaskModal = lazy(() => import('./AddTaskModal'));

interface GoalList {
  id: string;
  title: string;
  category?: string | null;
  targetYear?: number | null;
  parentGoalId?: string | null;
  parentGoal?: { id: string; title: string; category: string | null; targetYear: number | null } | null;
  subGoals?: { id: string; title: string; category: string | null; archivedAt: string | null; archiveReason: string | null }[];
  archivedAt?: string | null;
  archiveReason?: string | null;
  confirmedDone?: boolean;
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

function pluralDefinite(level: CategoryKey): string {
  return `الأهداف ال${categoryOf(level)!.label}`;
}

// عقدة واحدة في شجرة "خريطة العرض الكاملة": كارت الهدف نفسه + (لو ليه
// أهداف فرعية) زرار طي/توسيع + الأبناء متداخلين تحته بخط وصل رأسي، بشكل
// متكرر لأي عمق.
function GoalTreeNode({
  goal,
  allLists,
  depth,
  lifeAreas,
  onChange,
  onDeleteList,
  onManageLifeAreas,
  onCreateSubGoal,
  defaultExpanded,
}: {
  goal: GoalList;
  allLists: GoalList[];
  depth: number;
  lifeAreas: LifeAreaData[];
  onChange: () => void;
  onDeleteList: (id: string) => void;
  onManageLifeAreas: () => void;
  onCreateSubGoal: (data: NewTaskPayload) => Promise<void> | void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const children = useMemo(
    () => allLists.filter((l) => l.parentGoalId === goal.id),
    [allLists, goal.id]
  );
  const childCategory = goal.category ? CHILD_CATEGORY_OF[goal.category as CategoryKey] : null;
  const childDef = childCategory ? categoryOf(childCategory) : null;

  return (
    <div className="goal-node" style={{ ['--goal-depth' as any]: depth }}>
      <div className="goal-node-card-row">
        {children.length > 0 && (
          <button
            type="button"
            className={`goal-node-toggle ${expanded ? 'expanded' : ''}`}
            onClick={() => {
              sounds.click();
              setExpanded((v) => !v);
            }}
            aria-expanded={expanded}
            aria-label={expanded ? 'طي الأهداف الفرعية' : 'توسيع الأهداف الفرعية'}
            title={expanded ? 'طي الأهداف الفرعية' : 'توسيع الأهداف الفرعية'}
          >
            <DynamicIcon name="chevron-down" size={14} />
          </button>
        )}
        <div className="goal-node-card">
          <div id={`tree-list-${goal.id}`}>
            <TodoList
              list={goal}
              onChange={onChange}
              onDeleteList={onDeleteList}
              lifeAreas={lifeAreas}
              onManageLifeAreas={onManageLifeAreas}
              onCreateSubGoal={onCreateSubGoal}
            />
          </div>
        </div>
      </div>

      {children.length > 0 && expanded && (
        <div className="goal-node-children">
          {children.map((child) => (
            <GoalTreeNode
              key={child.id}
              goal={child}
              allLists={allLists}
              depth={depth + 1}
              lifeAreas={lifeAreas}
              onChange={onChange}
              onDeleteList={onDeleteList}
              onManageLifeAreas={onManageLifeAreas}
              onCreateSubGoal={onCreateSubGoal}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}

      {children.length === 0 && childDef && (
        <div className="goal-node-empty-hint" style={{ ['--goal-depth' as any]: depth + 1 }}>
          <DynamicIcon name="route" size={12} />
          لسه مفيش أهداف {childDef.label} تحت الهدف ده.
        </div>
      )}
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
}) {
  return (
    <div className="level-goal-card">
      <div id={`list-${goal.id}`}>
        <TodoList
          list={goal}
          onChange={onChange}
          onDeleteList={onDeleteList}
          lifeAreas={lifeAreas}
          onManageLifeAreas={onManageLifeAreas}
          onCreateSubGoal={onCreateSubGoal}
        />
      </div>
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

  // نافذة إنشاء هدف سنة جديد (مفيش هدف أب — تبدأ من الصفر على تصنيف سنوي).
  const [addYearGoalOpen, setAddYearGoalOpen] = useState(false);

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
    setAddYearGoalOpen(true);
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

  // ===== قسم "خريطة العرض الكاملة" (الشجرة المتداخلة) — قابل للطي/الفتح. =====
  const [treeOpen, setTreeOpen] = useState(true);

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
          <p>
            خطط سنتك من فوق لتحت: ابدأ بأهداف السنة الكبيرة، بعدين اقسّمها لأهداف شهرية، وكل هدف شهري لأهداف
            أسبوعية، وكل هدف أسبوعي لمهام يومية. كل مستوى مربوط بالمستوى اللي فوقه تلقائيًا، وإنجاز الأهداف
            الفرعية بيتحسب ضمن تقدّم الهدف الأكبر — كله في مكان واحد بدل ما يتفرق.
          </p>
        </div>
      </div>

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
              onClick={() => selectYear(y)}
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
            <button type="button" className="small goal-map-year-stepper-confirm" onClick={confirmAddYear}>
              <DynamicIcon name="check" size={13} /> اختيار
            </button>
            <button
              type="button"
              className="icon-btn small"
              onClick={() => setAddYearOpen(false)}
              aria-label="إلغاء"
              title="إلغاء"
            >
              <DynamicIcon name="x" size={13} />
            </button>
          </div>
        )}
      </div>
      {addYearOpen && (
        <p className="goal-map-year-stepper-hint">
          <DynamicIcon name="alert" size={12} /> مينفعش تختار سنة فاتت — إحنا حاليًا في {CURRENT_YEAR}.
        </p>
      )}

      {/* ===== هيدر السنة المختارة ===== */}
      <div className="goal-map-year-header">
        <div className="goal-map-year-header-text">
          <span className="goal-map-year-header-title" dir="ltr">
            {selectedYear}
          </span>
          <span className="goal-map-year-header-sub">
            {yearGoalsForSelected.length === 0
              ? 'لسه مفيش أهداف سنوية للسنة دي'
              : `${yearGoalsForSelected.length} هدف سنوي · ${yearTotalGoals} هدف على كل المستويات`}
          </span>
        </div>
        <button type="button" className="small goal-map-add-year-goal-btn" onClick={() => setAddYearGoalOpen(true)}>
          <DynamicIcon name="plus" size={14} /> هدف سنة {selectedYear} جديد
        </button>
      </div>

      {/* ===================================================================
          القسم الأول: بناء الخطة — تبويبات مستوى مسطّحة وسهلة التنقل.
          =================================================================== */}
      <div className="goal-map-section">
        <div className="goal-map-section-title">
          <DynamicIcon name="target" size={16} />
          <span>بناء الخطة</span>
        </div>

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

        {/* هيدر القسم: عنوان المستوى الحالي + زرار إضافة */}
        <div className="level-content-header">
          <span className="level-content-header-label">
            {focusGoal
              ? `${pluralDefinite(activeLevel)} تحت "${focusGoal.title}"`
              : `كل ${pluralDefinite(activeLevel)} — ${selectedYear}`}
          </span>
          <button type="button" className="small level-content-add-btn" onClick={openSectionAdd}>
            <DynamicIcon name="plus" size={14} /> {SINGULAR_INDEFINITE_LABEL[activeLevel]} جديد
          </button>
        </div>

        {/* محتوى المستوى: قائمة مسطّحة من الكروت */}
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
            <button type="button" onClick={openSectionAdd} disabled={activeLevel !== 'YEARLY' && yearGoalsByLevel.YEARLY.length === 0}>
              <DynamicIcon name="plus" size={15} /> {SINGULAR_INDEFINITE_LABEL[activeLevel]} جديد
            </button>
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
              />
            ))}
          </div>
        )}
      </div>

      {/* ===================================================================
          القسم الثاني: خريطة العرض الكاملة — الشجرة المتداخلة القديمة،
          مفيدة بعد ما تخلّص إدخال الأهداف عشان تشوف الترابط كله دفعة واحدة.
          =================================================================== */}
      {yearGoalsForSelected.length > 0 && (
        <div className="goal-map-section goal-map-tree-section">
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
            <span>خريطة العرض الكاملة لسنة {selectedYear}</span>
            <DynamicIcon name="chevron-down" size={15} className={`goal-map-section-chevron ${treeOpen ? 'expanded' : ''}`} />
          </button>

          {treeOpen && (
            <div className="goal-map-tree">
              {yearGoalsForSelected.map((goal) => (
                <GoalTreeNode
                  key={goal.id}
                  goal={goal}
                  allLists={lists}
                  depth={0}
                  lifeAreas={lifeAreas}
                  onChange={onChange}
                  onDeleteList={onDeleteList}
                  onManageLifeAreas={onManageLifeAreas}
                  onCreateSubGoal={onCreateGoal}
                  defaultExpanded
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Suspense fallback={null}>
        <AddTaskModal
          open={addYearGoalOpen}
          lifeAreas={lifeAreas}
          onClose={() => setAddYearGoalOpen(false)}
          onManageLifeAreas={() => {
            setAddYearGoalOpen(false);
            onManageLifeAreas();
          }}
          onCreate={onCreateGoal}
          onLifeAreaCreated={onLifeAreaCreated}
          presetCategory="YEARLY"
          presetTargetYear={selectedYear}
        />
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
