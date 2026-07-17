// ===== خريطة الأهداف (Goal Map) =====
// الشاشة المخصصة لتخطيط الأهداف الهرمية: سنة ← شهر ← أسبوع ← يوم. بدل ما
// الأهداف المرتبطة تفضل متفرقة بين أقسام الصفحة الرئيسية (مجمّعة حسب مجال
// الحياة/التصنيف زي TaskHierarchy)، هنا كل هدف سنوي بيتعرض كـ"جذر" شجرة،
// وتحته أهدافه الفرعية (شهرية ← أسبوعية ← يومية) متداخلة بصريًا بخطوط وصل
// واضحة، فيبان الترابط كله في مكان واحد من غير ما تدوّر عليه.
//
// المصدر الوحيد للحقيقة هنا هو نفس `lists` الجاية من الصفحة الرئيسية (نفس
// الـ prop بالظبط) — مفيش طلب سيرفر إضافي ولا حالة منفصلة، إحنا بس بنعيد
// ترتيبها بصريًا حسب `parentGoalId`/`category`/`targetYear` (نفس الحقول
// المستخدمة فعليًا في السيرفر للتحقق من صحة الهرم، شوف routes/lists.ts).
// كل كارت هدف هنا هو نفس مكوّن TodoList المستخدم في كل الموقع بالظبط —
// بكل خصائصه (تعديل، تذكيرات، مهام فرعية، تأكيد إنجاز...) من غير أي تكرار
// أو نسخة مصغّرة، فأي تعديل تعمله من هنا بيبان فورًا في كل مكان تاني.

import { useMemo, useState, Suspense, lazy } from 'react';
import TodoList from './TodoList';
import BackButton from './BackButton';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';
import { CategoryKey, CHILD_CATEGORY_OF, categoryOf } from '../lib/category';
import { LifeAreaData } from '../lib/lifeArea';
import type { NewTaskPayload } from './AddTaskModal';

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
const MIN_YEAR = 1970;
const MAX_YEAR = 3000;

function clampYear(y: number) {
  return Math.max(MIN_YEAR, Math.min(MAX_YEAR, y));
}

// عقدة واحدة في الشجرة: كارت الهدف نفسه + (لو ليه أهداف فرعية) زرار
// طي/توسيع + الأبناء متداخلين تحته بخط وصل رأسي، بشكل متكرر لأي عمق.
function GoalNode({
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
        </div>
      </div>

      {children.length > 0 && expanded && (
        <div className="goal-node-children">
          {children.map((child) => (
            <GoalNode
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
          لسه مفيش {childDef.label === 'يومية' ? 'أهداف يومية' : `أهداف ${childDef.label}`} تحت الهدف ده — دوس زرار{' '}
          <DynamicIcon name="plus" size={11} /> فوق في الكارت عشان تضيف واحد.
        </div>
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

  const [addYearInputOpen, setAddYearInputOpen] = useState(false);
  const [newYearDraft, setNewYearDraft] = useState(String(CURRENT_YEAR + 1));

  // نافذة إنشاء هدف سنة جديد (مفيش هدف أب — تبدأ من الصفر على تصنيف سنوي).
  const [addYearGoalOpen, setAddYearGoalOpen] = useState(false);

  const yearGoalsForSelected = useMemo(
    () => yearlyGoals.filter((g) => (g.targetYear || CURRENT_YEAR) === selectedYear),
    [yearlyGoals, selectedYear]
  );

  function selectYear(y: number) {
    sounds.click();
    setSelectedYear(y);
  }

  function confirmAddYear() {
    const n = Number(newYearDraft);
    if (!Number.isInteger(n) || n < MIN_YEAR || n > MAX_YEAR) {
      sounds.error();
      return;
    }
    const y = clampYear(n);
    sounds.click();
    setSelectedYear(y);
    setAddYearInputOpen(false);
    setAddYearGoalOpen(true);
  }

  // عدد الأهداف الفرعية (على أي مستوى مباشر تحت أهداف السنة) — بس عشان
  // نعرض عدد إجمالي مبدئي في هيدر السنة، مش نسبة تقدّم دقيقة عبر كل
  // المستويات (ده محتاج بيانات أعمق من اللي متاحة في القائمة النشطة بس).
  const yearTotalGoals = useMemo(() => {
    let count = yearGoalsForSelected.length;
    const ids = new Set(yearGoalsForSelected.map((g) => g.id));
    let frontier = ids;
    while (frontier.size > 0) {
      const nextFrontier = new Set<string>();
      for (const l of lists) {
        if (l.parentGoalId && frontier.has(l.parentGoalId)) {
          count += 1;
          nextFrontier.add(l.id);
        }
      }
      frontier = nextFrontier;
    }
    return count;
  }, [lists, yearGoalsForSelected]);

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

        {!addYearInputOpen ? (
          <button
            type="button"
            className="goal-map-year-chip goal-map-year-chip-add"
            onClick={() => {
              sounds.click();
              setNewYearDraft(String(Math.max(...years, CURRENT_YEAR) + 1));
              setAddYearInputOpen(true);
            }}
          >
            <DynamicIcon name="plus" size={13} /> سنة جديدة
          </button>
        ) : (
          <div className="goal-map-year-add-form">
            <input
              type="number"
              inputMode="numeric"
              className="goal-map-year-add-input"
              value={newYearDraft}
              dir="ltr"
              min={MIN_YEAR}
              max={MAX_YEAR}
              onChange={(e) => setNewYearDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmAddYear();
                }
                if (e.key === 'Escape') setAddYearInputOpen(false);
              }}
              autoFocus
              aria-label="السنة الجديدة"
            />
            <button type="button" className="small" onClick={confirmAddYear}>
              <DynamicIcon name="check" size={13} /> تأكيد
            </button>
            <button type="button" className="icon-btn small" onClick={() => setAddYearInputOpen(false)} aria-label="إلغاء">
              <DynamicIcon name="x" size={13} />
            </button>
          </div>
        )}
      </div>

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

      {/* ===== شجرة الأهداف ===== */}
      {yearGoalsForSelected.length === 0 ? (
        <div className="goal-map-empty">
          <DynamicIcon name="flag" size={30} className="empty-icon" />
          <p>
            ابدأ بتحديد أهم حاجة عايز تحققها في سنة {selectedYear}، وبعدين هنساعدك تقسمها لخطوات شهرية وأسبوعية
            ويومية واضحة.
          </p>
          <button type="button" onClick={() => setAddYearGoalOpen(true)}>
            <DynamicIcon name="plus" size={15} /> أضف أول هدف سنوي
          </button>
        </div>
      ) : (
        <div className="goal-map-tree">
          {yearGoalsForSelected.map((goal) => (
            <GoalNode
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
      </Suspense>
    </div>
  );
}
