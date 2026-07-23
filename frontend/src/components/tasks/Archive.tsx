import { useEffect, useMemo, useState } from 'react';
import { getArchive, restoreList } from '@/lib/api/api';
import { sounds } from '@/lib/audio/sounds';
import { toast } from '@/lib/core/toast';
import ConfirmModal from '@/components/common/ConfirmModal';
import BackButton from '@/components/layout/BackButton';
import { priorityOf } from '@/lib/core/priority';
import { CATEGORIES, CategoryKey } from '@/lib/core/category';
import { LifeAreaData } from '@/lib/core/lifeArea';
import { DynamicIcon } from '@/lib/core/icons';
import { LifeAreaBadge } from '@/components/life-areas/LifeArea';
import { PriorityBadge } from '@/components/life-areas/Priority';
import { CategoryBadge } from '@/components/life-areas/Category';

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

type ArchiveReason = 'COMPLETED' | 'OVERDUE';

type ArchiveTab = 'completed' | 'overdue';

interface ArchivedItem {
  id: string;
  content: string;
  isDone: boolean;
  priority?: string;
  dueDate?: string | null;
}

interface ArchivedList {
  id: string;
  title: string;
  priority?: string;
  category?: string | null;
  targetYear?: number | null;
  archivedAt: string;
  createdAt: string;
  recurringTaskId?: string | null;
  archiveReason?: ArchiveReason;
  endTime?: string | null;
  items: ArchivedItem[];
  lifeArea?: { id: string; name: string; color: string; icon: string | null; imageUrl: string | null } | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

const TAB_CONFIG: Record<
  ArchiveTab,
  { label: string; icon: string; title: string; description: string; emptyIcon: string; emptyText: string }
> = {
  completed: {
    label: 'المهام المنجزة',
    icon: 'check-circle',
    title: 'أرشيف المهام المنجزة',
    description:
      'كل مهمة رئيسية بتكتمل بتتنقل هنا تلقائيًا، منظّمة حسب سنة وشهر ويوم الإكمال، مع إمكانية البحث والفلترة واسترجاع أي مهمة لقائمتك النشطة في أي وقت.',
    emptyIcon: 'archive',
    emptyText: 'لسه مفيش مهام منجزة — أول ما تكمّل مهمة رئيسية بالكامل هتلاقيها هنا',
  },
  overdue: {
    label: 'المهام المتأخرة',
    icon: 'alert',
    title: 'المهام المتأخرة',
    description:
      'أي مهمة ليها موعد نهاية محدد وعدّى عليه 10 دقايق من غير ما تخلّصها، بتتنقل هنا تلقائيًا. المهام دي سجل دائم — مينفعش تتحذف ولا تتسترجع.',
    emptyIcon: 'timer',
    emptyText: 'مفيش مهام متأخرة — كل مهامك اللي ليها موعد نهاية خلصتها في وقتها 👏',
  },
};

export default function ArchivePage({
  onBack,
  onChange,
  onOpenMenu,
  menuOpen,
  lifeAreas = [],
  onManageLifeAreas,
  activeTab,
  onTabChange,
}: {
  onBack: () => void;
  onChange: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  lifeAreas?: LifeAreaData[];
  onManageLifeAreas?: () => void;
  // صفحة الأرشيف الفرعية الحالية (منجزة/متأخرة) بقت متحكَّم فيها من الأب
  // (App) عشان تتزامن مع رابط الصفحة وقائمة التنقل الجانبية، بدل ما تكون
  // state داخلية بتضيع مع أي تنقّل من برّه الصفحة.
  activeTab: ArchiveTab;
  onTabChange: (tab: ArchiveTab) => void;
}) {
  const [allLists, setAllLists] = useState<ArchivedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | CategoryKey>('ALL');
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [confirmRestore, setConfirmRestore] = useState<ArchivedList | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getArchive();
      setAllLists(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل الأرشيف');
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(list: ArchivedList) {
    setConfirmRestore(null);
    try {
      await restoreList(list.id);
      sounds.success();
      toast.success(`"${list.title}" اتنقلت لقسم "بانتظار المراجعة" في الصفحة الرئيسية — راجعها وأضفها لقائمتك`);
      setAllLists((prev) => prev.filter((l) => l.id !== list.id));
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر استرجاع المهمة من الأرشيف');
    }
  }

  function handleSwitchTab(tab: ArchiveTab) {
    if (tab === activeTab) return;
    sounds.click();
    onTabChange(tab);
  }

  // فتح/قفل الشجرة بيتصفّر عند تبديل الصفحة (سواء من التبويب هنا أو من رابط
  // مباشر أو من القائمة الجانبية) عشان كل صفحة تبدأ مفتوحة.
  useEffect(() => {
    setCollapsedYears(new Set());
    setCollapsedMonths(new Set());
    setCollapsedDays(new Set());
  }, [activeTab]);

  const completedLists = useMemo(
    () => allLists.filter((l) => l.archiveReason !== 'OVERDUE'),
    [allLists]
  );
  const overdueLists = useMemo(
    () => allLists.filter((l) => l.archiveReason === 'OVERDUE'),
    [allLists]
  );
  const sourceLists = activeTab === 'overdue' ? overdueLists : completedLists;
  const tabInfo = TAB_CONFIG[activeTab];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sourceLists.filter((l) => {
      if (categoryFilter !== 'ALL' && l.category !== categoryFilter) return false;
      if (!q) return true;
      if (l.title.toLowerCase().includes(q)) return true;
      if (l.lifeArea?.name.toLowerCase().includes(q)) return true;
      return l.items.some((i) => i.content.toLowerCase().includes(q));
    });
  }, [sourceLists, query, categoryFilter]);

  // تجميع هرمي: سنة → شهر → يوم — اعتمادًا على تاريخ الأرشفة (archivedAt).
  const tree = useMemo(() => {
    const byYear = new Map<number, Map<number, Map<number, ArchivedList[]>>>();
    for (const l of filtered) {
      const d = new Date(l.archivedAt);
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      if (!byYear.has(y)) byYear.set(y, new Map());
      const byMonth = byYear.get(y)!;
      if (!byMonth.has(m)) byMonth.set(m, new Map());
      const byDay = byMonth.get(m)!;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(l);
    }
    return byYear;
  }, [filtered]);

  const years = Array.from(tree.keys()).sort((a, b) => b - a);

  function toggleYear(y: number) {
    sounds.click();
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });
  }

  function toggleMonth(key: string) {
    sounds.click();
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleDay(key: string) {
    sounds.click();
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // بتفتح/تقفل كل المستويات الثلاثة (سنة/شهر/يوم) دفعة واحدة، عشان
  // التنقل يبقى سهل لما يكون الأرشيف فيه سنين وشهور كتير.
  function expandAll() {
    sounds.click();
    const allYears = new Set<number>();
    const allMonths = new Set<string>();
    const allDays = new Set<string>();
    for (const [y, byMonth] of tree.entries()) {
      allYears.add(y);
      for (const [m, byDay] of byMonth.entries()) {
        allMonths.add(`${y}-${m}`);
        for (const d of byDay.keys()) {
          allDays.add(`${y}-${m}-${d}`);
        }
      }
    }
    setCollapsedYears(allYears);
    setCollapsedMonths(allMonths);
    setCollapsedDays(allDays);
  }

  function collapseAll() {
    sounds.click();
    setCollapsedYears(new Set());
    setCollapsedMonths(new Set());
    setCollapsedDays(new Set());
  }

  // إحصائية فعليًا مفيدة وخاصة بالأرشيف (مش متكررة من صفحة البروفايل):
  // نشاط الأرشفة الحديث، محسوبة على التبويب الحالي بس.
  const archivedThisMonth = useMemo(() => {
    const now = new Date();
    return sourceLists.filter((l) => {
      const d = new Date(l.archivedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [sourceLists]);

  return (
    <div className="container view-fade archive-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>الأرشيف</strong>
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

      <div className={`archive-main-tabs ${activeTab === 'overdue' ? 'archive-main-tabs-danger' : ''}`} role="tablist" aria-label="تبويبات الأرشيف">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'completed'}
          className={activeTab === 'completed' ? 'active' : ''}
          onClick={() => handleSwitchTab('completed')}
        >
          <DynamicIcon name="check-circle" size={15} />
          <span>{TAB_CONFIG.completed.label}</span>
          <span className="archive-main-tabs-count">{completedLists.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overdue'}
          className={activeTab === 'overdue' ? 'active' : ''}
          onClick={() => handleSwitchTab('overdue')}
        >
          <DynamicIcon name="alert" size={15} />
          <span>{TAB_CONFIG.overdue.label}</span>
          <span className="archive-main-tabs-count">{overdueLists.length}</span>
        </button>
      </div>

      <div className={`life-area-intro archive-intro ${activeTab === 'overdue' ? 'archive-intro-danger' : ''}`}>
        <DynamicIcon name={tabInfo.icon} size={28} className="life-area-intro-icon" />
        <div>
          <h1>{tabInfo.title}</h1>
          <p>{tabInfo.description}</p>
        </div>
      </div>

      <div className="stats-row archive-stats-row">
        <div className="stat-card">
          <span className="stat-card-value">{sourceLists.length}</span>
          <span className="stat-card-label">{activeTab === 'overdue' ? 'مهام متأخرة' : 'مهام مؤرشفة'}</span>
        </div>
        <div className="stat-card">
          <span className={`stat-card-value ${activeTab === 'overdue' ? 'stat-card-danger' : 'stat-card-success'}`}>
            {archivedThisMonth}
          </span>
          <span className="stat-card-label">مؤرشفة الشهر ده</span>
        </div>
      </div>

      <div className="archive-toolbar">
        <div className="archive-search">
          <DynamicIcon name="search" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              activeTab === 'overdue'
                ? 'ابحث في المهام المتأخرة (اسم المهمة، مهمة فرعية، مجال حياة)'
                : 'ابحث في المهام المؤرشفة (اسم المهمة، مهمة فرعية، مجال حياة)'
            }
          />
          {query && (
            <button type="button" className="archive-search-clear" onClick={() => setQuery('')} aria-label="مسح البحث">
              <DynamicIcon name="x" size={14} />
            </button>
          )}
        </div>

        {sourceLists.length > 0 && (
          <div className="filter-tabs category-filter-tabs" role="tablist" aria-label="فلترة الأرشيف حسب التصنيف">
            <button
              className={categoryFilter === 'ALL' ? 'active' : ''}
              onClick={() => setCategoryFilter('ALL')}
              type="button"
              role="tab"
              aria-selected={categoryFilter === 'ALL'}
            >
              الكل
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={categoryFilter === c.key ? 'active' : ''}
                onClick={() => setCategoryFilter(c.key)}
                type="button"
                role="tab"
                aria-selected={categoryFilter === c.key}
              >
                <DynamicIcon name={c.icon} size={14} /> {c.short}
              </button>
            ))}
          </div>
        )}

        {years.length > 0 && (
          <div className="archive-expand-controls">
            <button type="button" className="small" onClick={expandAll}>
              <DynamicIcon name="chevrons-down" size={14} /> فتح الكل
            </button>
            <button type="button" className="small" onClick={collapseAll}>
              <DynamicIcon name="chevrons-up" size={14} /> قفل الكل
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="lists-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      )}

      {!loading && sourceLists.length === 0 && (
        <p className="empty">
          <DynamicIcon name={tabInfo.emptyIcon} size={32} className="empty-icon" />
          {tabInfo.emptyText}
        </p>
      )}

      {!loading && sourceLists.length > 0 && filtered.length === 0 && (
        <p className="empty">
          <DynamicIcon name="search" size={32} className="empty-icon" />
          مفيش نتائج مطابقة للبحث أو الفلتر ده
        </p>
      )}

      {!loading &&
        years.map((y) => {
          const yearCollapsed = collapsedYears.has(y);
          const byMonth = tree.get(y)!;
          const months = Array.from(byMonth.keys()).sort((a, b) => b - a);
          const yearCount = months.reduce(
            (sum, m) => sum + Array.from(byMonth.get(m)!.values()).reduce((s, arr) => s + arr.length, 0),
            0
          );
          return (
            <div className="archive-year-group" key={y}>
              <button type="button" className="archive-year-header" onClick={() => toggleYear(y)}>
                <span className={`archive-collapse-caret ${yearCollapsed ? 'collapsed' : ''}`} aria-hidden="true">
                  <DynamicIcon name="chevron-down" size={14} />
                </span>
                <span className="archive-year-title" dir="ltr">{y}</span>
                <span className="archive-year-count">{yearCount} مهمة</span>
              </button>

              {!yearCollapsed && (
                <div className="archive-year-body">
                  {months.map((m) => {
                    const monthKey = `${y}-${m}`;
                    const monthCollapsed = collapsedMonths.has(monthKey);
                    const byDay = byMonth.get(m)!;
                    const days = Array.from(byDay.keys()).sort((a, b) => b - a);
                    const monthCount = days.reduce((sum, d) => sum + byDay.get(d)!.length, 0);
                    return (
                      <div className="archive-month-group" key={monthKey}>
                        <button type="button" className="archive-month-header" onClick={() => toggleMonth(monthKey)}>
                          <span className={`archive-collapse-caret ${monthCollapsed ? 'collapsed' : ''}`} aria-hidden="true">
                            <DynamicIcon name="chevron-down" size={14} />
                          </span>
                          <span>{MONTHS_AR[m]}</span>
                          <span className="archive-month-count">{monthCount}</span>
                        </button>

                        {!monthCollapsed && (
                          <div className="archive-month-body">
                            {days.map((d) => {
                              const dayLists = byDay.get(d)!;
                              const weekday = WEEKDAYS_AR[new Date(y, m, d).getDay()];
                              const dayKey = `${monthKey}-${d}`;
                              const dayCollapsed = collapsedDays.has(dayKey);
                              return (
                                <div className="archive-day-group" key={dayKey}>
                                  <button
                                    type="button"
                                    className="archive-day-header"
                                    onClick={() => toggleDay(dayKey)}
                                    aria-expanded={!dayCollapsed}
                                  >
                                    <span className={`archive-collapse-caret ${dayCollapsed ? 'collapsed' : ''}`} aria-hidden="true">
                                      <DynamicIcon name="chevron-down" size={14} />
                                    </span>
                                    <span className="archive-day-number">{d}</span>
                                    <span className="archive-day-weekday">{weekday}</span>
                                    <span className="archive-day-count">{dayLists.length} مهمة</span>
                                  </button>

                                  {!dayCollapsed && (
                                  <div className="archive-day-body">
                                  <div className="lists-grid hier-lists-grid">
                                    {dayLists.map((list) => {
                                      const isOverdueCard = list.archiveReason === 'OVERDUE';
                                      const total = list.items.length;
                                      const doneCount = list.items.filter((i) => i.isDone).length;
                                      const progress = total === 0 ? 0 : Math.round((doneCount / total) * 100);
                                      const isComplete = total > 0 && doneCount === total;
                                      const priorityColor = priorityOf(list.priority).color;
                                      const accent = isOverdueCard ? 'var(--danger)' : isComplete ? 'var(--success)' : priorityColor;
                                      return (
                                        <div
                                          className={`list-card list-card-compact archive-task-card ${isComplete ? 'list-complete' : ''} ${isOverdueCard ? 'archive-task-card-overdue' : ''}`}
                                          key={list.id}
                                          style={{ position: 'relative', ['--card-accent' as any]: accent }}
                                        >
                                          <div className="list-header">
                                            <span
                                              className={`checkbox list-checkbox disabled ${isComplete ? 'checked' : ''}`}
                                              aria-hidden="true"
                                              title={isComplete ? 'مكتملة' : 'غير مكتملة بالكامل'}
                                            >
                                              <svg viewBox="0 0 16 16">
                                                <polyline points="3,9 6.5,12.5 13,4" />
                                              </svg>
                                            </span>

                                            <div className="list-header-title">
                                              <div className="list-title-plain">
                                                <h2>{list.title}</h2>
                                                {total > 0 && (
                                                  <span className="list-title-subcount">
                                                    {doneCount}/{total}
                                                  </span>
                                                )}
                                              </div>
                                              {list.recurringTaskId && (
                                                <span className="recurring-origin-badge" title="اتولّدت تلقائيًا من مهمة متكررة">
                                                  <DynamicIcon name="repeat" size={12} />
                                                </span>
                                              )}
                                            </div>

                                            <div className="row-actions card-actions">
                                              {isOverdueCard ? (
                                                <span
                                                  className="overdue-lock-badge"
                                                  title="مهمة متأخرة اتؤرشفت تلقائيًا — مينفعش تتحذف أو تتسترجع"
                                                >
                                                  <DynamicIcon name="lock" size={13} />
                                                </span>
                                              ) : (
                                                <button
                                                  className="card-icon-action"
                                                  onClick={() => setConfirmRestore(list)}
                                                  aria-label="استرجاع المهمة من الأرشيف"
                                                  type="button"
                                                  title="استرجاع"
                                                >
                                                  <DynamicIcon name="undo" size={17} />
                                                </button>
                                              )}
                                            </div>
                                          </div>

                                          <div className="list-meta-row">
                                            <div className="list-meta-badges">
                                              <PriorityBadge value={list.priority || 'NONE'} onChange={() => {}} size="sm" disabled />
                                              <CategoryBadge value={list.category} targetYear={list.targetYear} onChange={() => {}} size="sm" disabled />
                                              <LifeAreaBadge value={list.lifeArea || null} areas={lifeAreas} onChange={() => {}} size="sm" disabled />
                                              {isOverdueCard && <span className="overdue-badge-chip">متأخرة</span>}
                                            </div>
                                            <div className="list-meta-timers">
                                              {isOverdueCard && list.endTime && (
                                                <span className="timeline-compact timeline-compact-readonly timeline-compact-critical" title="الموعد النهائي الأصلي للمهمة">
                                                  <span className="timeline-compact-icon" aria-hidden="true">
                                                    <DynamicIcon name="alert" size={14} />
                                                  </span>
                                                  <span className="timeline-compact-time">
                                                    {formatDateTime(list.endTime)}
                                                  </span>
                                                </span>
                                              )}
                                              <span className="timeline-compact timeline-compact-readonly" title={isOverdueCard ? 'وقت النقل للأرشيف' : 'وقت الأرشفة'}>
                                                <span className="timeline-compact-icon" aria-hidden="true">
                                                  <DynamicIcon name="archive" size={14} />
                                                </span>
                                                <span className="timeline-compact-time" dir="ltr">
                                                  {formatTime(list.archivedAt)}
                                                </span>
                                              </span>
                                            </div>
                                          </div>

                                          {total > 0 && (
                                            <div className="list-progress-row">
                                              <div className="list-progress">
                                                <div className="list-progress-fill" style={{ width: `${progress}%` }} />
                                              </div>
                                              <span className="list-progress-label">
                                                {doneCount}/{total} · {progress}٪
                                              </span>
                                            </div>
                                          )}

                                          {total === 0 ? (
                                            <p className="empty small">مفيش مهام فرعية في المهمة دي</p>
                                          ) : (
                                            <ul className="subtask-tree">
                                              {list.items.map((it) => (
                                                <li key={it.id} className={it.isDone ? 'done' : ''}>
                                                  <label>
                                                    <span className={`checkbox ${it.isDone ? 'checked' : ''}`} aria-hidden="true">
                                                      <svg viewBox="0 0 16 16">
                                                        <polyline points="3,9 6.5,12.5 13,4" />
                                                      </svg>
                                                    </span>
                                                    <span>{it.content}</span>
                                                  </label>
                                                  <div className="row-actions">
                                                    {it.priority && it.priority !== 'NONE' && (
                                                      <PriorityBadge value={it.priority} onChange={() => {}} size="sm" disabled />
                                                    )}
                                                    {it.dueDate && (
                                                      <span className="due-date-chip" title="موعد الاستحقاق">
                                                        <DynamicIcon name="calendar" size={12} />{' '}
                                                        {new Date(it.dueDate).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                                                      </span>
                                                    )}
                                                  </div>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      {confirmRestore && (
        <ConfirmModal
          title="استرجاع المهمة من الأرشيف؟"
          description={
            <>
              هتتنقل "<strong>{confirmRestore.title}</strong>" لقسم "بانتظار المراجعة" في الصفحة الرئيسية، وتقدر
              تراجعها وتعدّلها قبل ما تأكّد رجوعها لقائمتك النشطة.
            </>
          }
          confirmLabel="استرجاع"
          danger={false}
          onCancel={() => setConfirmRestore(null)}
          onConfirm={() => handleRestore(confirmRestore)}
        />
      )}
    </div>
  );
}
