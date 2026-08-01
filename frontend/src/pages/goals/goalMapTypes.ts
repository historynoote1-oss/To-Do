// ===== أنواع بيانات خريطة الأهداف =====
// اتقسّمت هنا لوحدها عشان GoalMap.tsx وZoomFolderGrid.tsx (وأي ملف تاني
// يحتاج يتعامل مع بيانات خريطة الأهداف مستقبلًا) يقدروا يستوردوها من غير
// ما يحتاجوا يفتحوا الملف الرئيسي الضخم.

import { NewTaskPayload } from '@/pages/tasks/AddTaskModal';
import { LifeAreaData } from '@/utils/lifeArea';

export interface GoalList {
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

export interface GoalMapProps {
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

// ===== "خريطة العرض الكاملة" — Zoom Navigation =====
// بدل الشجرة المتداخلة القديمة (كل المستويات ظاهرة دفعة واحدة بتعشيش
// بصري)، هنا كل ضغطة بتدخل المستخدم مستوى أعمق زي فتح مجلد، بترتيب:
// مجال حياة ← هدف سنوي ← أهداف شهرية ← أسبوعية ← يومية ← المهمة نفسها.
// السنة *مش* خطوة جوّه المسار ده — هي نفسها تبويب السنة المختار فوق في
// "بناء الخطة" (selectedYear)، فكل الأقسام دايمًا بتعكس نفس السنة الواحدة
// المختارة من فوق. `ZoomFolderGrid` هي وحدة البناء المشتركة لأي مستوى
// "مجلدات" (كل حاجة قبل المهمة النهائية) — كارت لكل عنصر بعنوان/أيقونة/
// شريط تقدّم، والضغط عليه بينفّذ `onOpen` بتاعه (اللي بيتحكم فيه GoalMap
// نفسه).
export interface ZoomFolderItem {
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
export type ZoomGridDensity = 'folders' | 'months' | 'weeks' | 'days';
