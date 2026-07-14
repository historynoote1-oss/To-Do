import { useEffect, useMemo, useState } from 'react';
import { getArchive, restoreList } from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import ConfirmModal from './ConfirmModal';
import BackButton from './BackButton';
import { priorityOf } from '../lib/priority';
import { CATEGORIES, CategoryKey } from '../lib/category';
import { LifeAreaData } from '../lib/lifeArea';
import { DynamicIcon } from '../lib/icons';
import { LifeAreaBadge } from './LifeArea';
import { PriorityBadge } from './Priority';
import { CategoryBadge } from './Category';

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

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
  items: ArchivedItem[];
  lifeArea?: { id: string; name: string; color: string; icon: string | null; imageUrl: string | null } | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

export default function ArchivePage({
  onBack,
  onChange,
  onOpenMenu,
  menuOpen,
  lifeAreas = [],
  onManageLifeAreas,
}: {
  onBack: () => void;
  onChange: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  lifeAreas?: LifeAreaData[];
  onManageLifeAreas?: () => void;
}) {
  const [lists, setLists] = useState<ArchivedList[]>([]);
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
      setLists(data);
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
      setLists((prev) => prev.filter((l) => l.id !== list.id));
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر استرجاع المهمة من الأرشيف');
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lists.filter((l) => {
      if (categoryFilter !== 'ALL' && l.category !== categoryFilter) return false;
      if (!q) return true;
      if (l.title.toLowerCase().includes(q)) return true;
      if (l.lifeArea?.name.toLowerCase().includes(q)) return true;
      return l.items.some((i) => i.content.toLowerCase().includes(q));
    });
  }, [lists, query, categoryFilter]);

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
    setCollapsedYears(new Set());
    setCollapsedMonths(new Set());
    setCollapsedDays(new Set());
  }

  function collapseAll() {
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

  // إحصائية فعليًا مفيدة وخاصة بالأرشيف (مش متكررة من صفحة البروفايل):
  // نشاط الأرشفة الحديث. (إحصائية "متوسط أيام الإنجاز" اتشالت لأنها
  // بتوصف سرعة إنجاز المهام بشكل عام، ومالهاش علاقة مباشرة بقسم الأرشيف نفسه.)
  const archivedThisMonth = useMemo(() => {
    const now = new Date();
    return lists.filter((l) => {
      const d = new Date(l.archivedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [lists]);

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

      <div className="life-area-intro archive-intro">
        <DynamicIcon name="archive" size={28} className="life-area-intro-icon" />
        <div>
          <h1>أرشيف المهام المكتملة</h1>
          <p>
            كل مهمة رئيسية بتكتمل بتتنقل هنا تلقائيًا، منظّمة حسب سنة وشهر ويوم الإكمال، مع إمكانية البحث والفلترة
            واسترجاع أي مهمة لقائمتك النشطة في أي وقت.
          </p>
        </div>
      </div>

      <div className="stats-row archive-stats-row">
        <div className="stat-card">
          <span className="stat-card-value">{lists.length}</span>
          <span className="stat-card-label">مهام مؤرشفة</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value stat-card-success">{archivedThisMonth}</span>
          <span className="stat-card-label">مؤرشفة الشهر ده</span>
        </div>
      </div>

      <div className="archive-toolbar">
        <div className="archive-search">
          <DynamicIcon name="search" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في المهام المؤرشفة (اسم المهمة، مهمة فرعية، مجال حياة)"
          />
          {query && (
            <button type="button" className="archive-search-clear" onClick={() => setQuery('')} aria-label="مسح البحث">
              <DynamicIcon name="x" size={14} />
            </button>
          )}
        </div>

        {lists.length > 0 && (
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

      {!loading && lists.length === 0 && (
        <p className="empty">
          <DynamicIcon name="archive" size={32} className="empty-icon" />
          لسه مفيش مهام مؤرشفة — أول ما تكمّل مهمة رئيسية بالكامل هتلاقيها هنا
        </p>
      )}

      {!loading && lists.length > 0 && filtered.length === 0 && (
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
                                      const total = list.items.length;
                                      const doneCount = list.items.filter((i) => i.isDone).length;
                                      const progress = total === 0 ? 0 : Math.round((doneCount / total) * 100);
                                      const isComplete = total > 0 && doneCount === total;
                                      const priorityColor = priorityOf(list.priority).color;
                                      return (
                                        <div
                                          className={`list-card list-card-compact archive-task-card ${isComplete ? 'list-complete' : ''}`}
                                          key={list.id}
                                          style={{ position: 'relative', ['--card-accent' as any]: isComplete ? 'var(--success)' : priorityColor }}
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
                                              <button
                                                className="card-icon-action"
                                                onClick={() => setConfirmRestore(list)}
                                                aria-label="استرجاع المهمة من الأرشيف"
                                                type="button"
                                                title="استرجاع"
                                              >
                                                <DynamicIcon name="undo" size={17} />
                                              </button>
                                            </div>
                                          </div>

                                          <div className="list-meta-row">
                                            <div className="list-meta-badges">
                                              <PriorityBadge value={list.priority || 'NONE'} onChange={() => {}} size="sm" disabled />
                                              <CategoryBadge value={list.category} targetYear={list.targetYear} onChange={() => {}} size="sm" disabled />
                                              <LifeAreaBadge value={list.lifeArea || null} areas={lifeAreas} onChange={() => {}} size="sm" disabled />
                                            </div>
                                            <div className="list-meta-timers">
                                              <span className="timeline-compact timeline-compact-readonly" title="وقت الأرشفة">
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
