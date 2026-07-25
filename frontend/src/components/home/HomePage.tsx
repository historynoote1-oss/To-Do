import { useMemo, useState } from 'react';
import { DynamicIcon } from '@/lib/core/icons';
import { CategoryKey } from '@/lib/core/category';
import { ViewName } from '@/lib/api/routes';
import CompletionRateCard from '@/components/stats/CompletionRateCard';
import TaskDistributionCard from '@/components/stats/TaskDistributionCard';

export interface HomeUpcomingItem {
  id: string;
  content: string;
  isDone: boolean;
}

export interface HomeUpcomingEntry {
  list: {
    id: string;
    title: string;
    lifeArea?: { color: string; icon: string | null } | null;
  };
  due: number;
  overdue: boolean;
  item: HomeUpcomingItem;
}

export interface HomeStatsList {
  id: string;
  title: string;
  category?: string | null;
  items: { isDone: boolean }[];
}

interface Props {
  loading: boolean;
  greeting: string;
  todayLabel: string;
  todaySnapshot: { dueToday: number; overdue: number; dueTodayTotal: number; dueTodayDone: number };
  streak: number;
  upcomingLists: HomeUpcomingEntry[];
  statsLists: HomeStatsList[];
  onNavigate: (view: ViewName) => void;
  onQuickAdd: () => void;
  onToggleUpcomingItem: (entry: HomeUpcomingEntry) => void;
  onSelectCategory: (key: CategoryKey) => void;
}

// دايرة تقدّم بسيطة لنسبة إنجاز اليوم — نسخة أكبر شوية من نفس فكرة
// الدايرة في CompletionRateCard، مدمجة جوه بطاقة الترحيب نفسها بدل ما
// تتحط في بطاقة منفصلة، عشان المساحة الفاضية تحت نص الترحيب تتستغل.
function TodayRing({ pct, size = 54 }: { pct: number; size?: number }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const color = pct >= 70 ? 'var(--success)' : 'var(--accent)';
  return (
    <span className="completion-ring-wrap home-hero-ring" aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="completion-ring">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="completion-ring-fill"
        />
      </svg>
      <span className="completion-ring-value home-hero-ring-value">{pct}%</span>
    </span>
  );
}

// رسالة قصيرة تتغيّر حسب طول السلسلة الحالية — بطاقة الستريك تحس إنها
// حيّة ومش رقم بارد بس.
function streakMessage(streak: number): string {
  if (streak <= 0) return 'ابدأ سلسلة إنجاز جديدة النهاردة';
  if (streak < 3) return 'بداية قوية، كمّل عليها';
  if (streak < 7) return 'مستمر وثابت، تحت تشد';
  if (streak < 30) return 'سلسلة قوية — منها لله';
  return 'إنجاز استثنائي، أسطورة';
}

const QUICK_LINKS: { view: ViewName; icon: string; label: string; iconClass: string }[] = [
  { view: 'lifeAreas', icon: 'compass', label: 'مجالات الحياة', iconClass: 'home-quick-icon-areas' },
  { view: 'pomodoro', icon: 'timer', label: 'بومودورو', iconClass: 'home-quick-icon-pomodoro' },
  { view: 'prayerTimes', icon: 'moon-star', label: 'مواقيت الصلاة', iconClass: 'home-quick-icon-prayer' },
  { view: 'player', icon: 'book-open', label: 'مشغّل القرآن', iconClass: 'home-quick-icon-quran' },
  { view: 'profile', icon: 'user', label: 'الملف الشخصي', iconClass: 'home-quick-icon-profile' },
];

export default function HomePage({
  loading,
  greeting,
  todayLabel,
  todaySnapshot,
  streak,
  upcomingLists,
  statsLists,
  onNavigate,
  onQuickAdd,
  onToggleUpcomingItem,
  onSelectCategory,
}: Props) {
  const [query, setQuery] = useState('');

  // نتائج البحث السريع — فلترة محلية بسيطة على عنوان المهمة الرئيسية،
  // من غير أي طلب سيرفر إضافي (البيانات أصلًا محمّلة في الصفحة).
  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const lower = q.toLocaleLowerCase('ar');
    return statsLists.filter((l) => l.title.toLocaleLowerCase('ar').includes(lower)).slice(0, 6);
  }, [query, statsLists]);

  const todayRatePct =
    todaySnapshot.dueTodayTotal > 0 ? Math.round((todaySnapshot.dueTodayDone / todaySnapshot.dueTodayTotal) * 100) : null;

  return (
    <>
      {/* بطاقة ترحيب + تقدّم اليوم مدموجين — تحية حسب وقت اليوم، التاريخ،
          ورسالة حالة، وجنبهم دايرة نسبة إنجاز مهام اليوم لو فيه مهام
          مستحقة النهاردة أصلًا (تجنّبًا لدايرة 0% بلا معنى). */}
      <section className="home-hero" aria-label="ترحيب">
        <div className="home-hero-text">
          <h2 className="home-hero-greeting">{greeting}</h2>
          <p className="home-hero-date">{todayLabel}</p>
          {todaySnapshot.overdue > 0 ? (
            <span className="home-hero-status home-hero-status-danger">
              <DynamicIcon name="alert" size={14} />
              {todaySnapshot.overdue} مهمة اتأخر معادها
            </span>
          ) : todaySnapshot.dueToday > 0 ? (
            <span className="home-hero-status home-hero-status-info">
              <DynamicIcon name="calendar" size={14} />
              {todaySnapshot.dueToday} مستحقة النهاردة
            </span>
          ) : (
            <span className="home-hero-status home-hero-status-ok">
              <DynamicIcon name="check-circle" size={14} />
              كله تحت السيطرة
            </span>
          )}
        </div>
        {todayRatePct !== null && (
          <div className="home-hero-ring-block">
            <TodayRing pct={todayRatePct} />
            <span className="home-hero-ring-label">تقدّم اليوم</span>
          </div>
        )}
      </section>

      {/* بطاقة الستريك — مستقلة عن الرقم الصغير في الهيدر، عشان قيمتها
          التحفيزية تاخد مساحة بصرية تستاهلها. */}
      <section className="home-streak-card" aria-label="سلسلة الإنجاز">
        <span className="home-streak-icon">
          <DynamicIcon name="flame" size={22} />
        </span>
        <div className="home-streak-text">
          <span className="home-streak-count">
            {streak} <span className="home-streak-unit">يوم</span>
          </span>
          <span className="home-streak-message">{streakMessage(streak)}</span>
        </div>
      </section>

      {/* بحث سريع — فلترة فورية على عنوان المهام الرئيسية، من غير الحاجة
          للدخول لخريطة الأهداف الأول. */}
      <section className="home-search" aria-label="بحث سريع">
        <span className="home-search-icon">
          <DynamicIcon name="search" size={16} />
        </span>
        <input
          type="search"
          className="home-search-input"
          placeholder="ابحث عن مهمة..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>

      {query.trim() !== '' && (
        <div className="home-search-results">
          {searchResults.length > 0 ? (
            searchResults.map((r) => (
              <button key={r.id} className="home-search-result" type="button" onClick={() => onNavigate('goalMap')}>
                <DynamicIcon name="tag" size={14} />
                <span>{r.title}</span>
              </button>
            ))
          ) : (
            <p className="home-search-empty">مفيش نتائج مطابقة لـ "{query}"</p>
          )}
        </div>
      )}

      {loading && (
        <div className="lists-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      )}

      {/* أقرب المهام استحقاقًا — أهم محتوى فعلي في الصفحة، فبيجي فوق شبكة
          الوصول السريع مش تحتها. كل صف فيه مربّع تحديد لإنجاز أقرب مهمة
          فرعية مباشرة من غير الدخول لخريطة الأهداف. */}
      {!loading && (
        <section className="home-upcoming" aria-label="أقرب المهام استحقاقًا">
          <h2 className="home-section-title">أقرب المهام استحقاقًا</h2>
          {upcomingLists.length > 0 ? (
            <div className="home-upcoming-list">
              {upcomingLists.map((entry) => {
                const { list, due, overdue, item } = entry;
                return (
                  <div
                    key={list.id}
                    className={`home-upcoming-row ${overdue ? 'overdue' : ''}`}
                    style={{ ['--chip-color' as any]: list.lifeArea?.color || 'var(--accent)' }}
                  >
                    <button
                      type="button"
                      className="home-upcoming-row-check"
                      title="علّم كمنجزة"
                      aria-label={`علّم "${item.content}" كمنجزة`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleUpcomingItem(entry);
                      }}
                    >
                      <DynamicIcon name="check" size={14} />
                    </button>
                    <button className="home-upcoming-row-body" onClick={() => onNavigate('goalMap')} type="button">
                      <span className="home-upcoming-row-icon">
                        <DynamicIcon name={(list.lifeArea?.icon as any) || 'tag'} size={16} />
                      </span>
                      <span className="home-upcoming-row-title">{list.title}</span>
                      <span className="home-upcoming-row-time">
                        {overdue && <DynamicIcon name="alert" size={12} />}
                        {new Date(due).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            // حالة فاضية بدل ما القسم يختفي بالكامل — بتشجّع المستخدم يضيف
            // مهمة بدل ما يحس إن الصفحة ناقصة عنصر من غير سبب واضح.
            <button className="home-upcoming-empty" onClick={onQuickAdd} type="button">
              <DynamicIcon name="check-circle" size={22} />
              <span className="home-upcoming-empty-title">مفيش مهام قريبة الاستحقاق</span>
              <span className="home-upcoming-empty-cta">
                <DynamicIcon name="plus" size={13} /> أضف مهمة جديدة
              </span>
            </button>
          )}
        </section>
      )}

      {/* شبكة الوصول السريع — ثانوية بعد المحتوى الفعلي، وبقت 5 اختصارات
          بس بعد ما زرار "خريطة الأهداف" (اللي كان لبسه اسمه أصلًا مربوط
          بإضافة مهمة) اتشال من هنا وبقى زرار الإضافة العائم منفصل وواضح. */}
      <nav className="home-quick-grid" aria-label="وصول سريع">
        {QUICK_LINKS.map((link) => (
          <button key={link.view} className="home-quick-card" onClick={() => onNavigate(link.view)} type="button">
            <span className={`home-quick-icon-wrap ${link.iconClass}`}>
              <DynamicIcon name={link.icon as any} size={20} />
            </span>
            <span className="home-quick-label">{link.label}</span>
          </button>
        ))}
      </nav>

      {/* ملخص إحصائي مصغّر — نفس بطاقتي نسبة الإنجاز وتوزيع المهام
          المستخدمة في صفحة الإحصائيات، معروضين هنا كخلاصة سريعة. */}
      {!loading && statsLists.length > 0 && (
        <section className="home-stats-summary" aria-label="ملخص عام">
          <h2 className="home-section-title">ملخص عام</h2>
          <div className="home-stats-summary-grid">
            <CompletionRateCard lists={statsLists} onSelectCategory={onSelectCategory} />
            <TaskDistributionCard lists={statsLists} onSelectCategory={onSelectCategory} />
          </div>
        </section>
      )}
    </>
  );
}
