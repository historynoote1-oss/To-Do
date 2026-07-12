import { useEffect, useMemo, useState } from 'react';
import { getArchive, restoreList, deleteList, resolveLifeAreaImageUrl } from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import ConfirmModal from './ConfirmModal';
import { priorityOf } from '../lib/priority';
import { CATEGORIES, CategoryKey, categoryOf } from '../lib/category';
import { hexToSoftBg } from '../lib/lifeArea';

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
}

interface ArchivedList {
  id: string;
  title: string;
  priority?: string;
  category?: string | null;
  targetYear?: number | null;
  archivedAt: string;
  createdAt: string;
  items: ArchivedItem[];
  lifeArea?: { id: string; name: string; color: string; icon: string | null; imageUrl: string | null } | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

export default function ArchivePage({ onBack, onChange }: { onBack: () => void; onChange: () => void }) {
  const [lists, setLists] = useState<ArchivedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | CategoryKey>('ALL');
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [confirmRestore, setConfirmRestore] = useState<ArchivedList | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ArchivedList | null>(null);

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
      toast.success(`اترجعت "${list.title}" للمهام النشطة 👋`);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر استرجاع المهمة من الأرشيف');
    }
  }

  async function handleDelete(list: ArchivedList) {
    setConfirmDelete(null);
    sounds.deleteItem();
    setLists((prev) => prev.filter((l) => l.id !== list.id));
    try {
      await deleteList(list.id);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف المهمة نهائيًا');
      load();
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

  const totalDone = lists.reduce((sum, l) => sum + l.items.filter((i) => i.isDone).length, 0);

  return (
    <div className="container view-fade archive-page">
      <div className="top-bar">
        <button className="small" onClick={onBack} type="button">
          رجوع
        </button>
        <strong>الأرشيف</strong>
        <span aria-hidden="true" style={{ width: 0 }} />
      </div>

      <div className="life-area-intro archive-intro">
        <span className="life-area-intro-icon" aria-hidden="true">🗄️</span>
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
          <span className="stat-card-value stat-card-success">{totalDone}</span>
          <span className="stat-card-label">مهام فرعية منجزة</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value">{years.length}</span>
          <span className="stat-card-label">سنوات مؤرشفة</span>
        </div>
      </div>

      <div className="archive-toolbar">
        <div className="archive-search">
          <span aria-hidden="true">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في المهام المؤرشفة (اسم المهمة، مهمة فرعية، مجال حياة)"
          />
          {query && (
            <button type="button" className="archive-search-clear" onClick={() => setQuery('')} aria-label="مسح البحث">
              ✕
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
                <span aria-hidden="true">{c.icon}</span> {c.short}
              </button>
            ))}
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
          <span className="empty-icon">🗄️</span>
          لسه مفيش مهام مؤرشفة — أول ما تكمّل مهمة رئيسية بالكامل هتلاقيها هنا
        </p>
      )}

      {!loading && lists.length > 0 && filtered.length === 0 && (
        <p className="empty">
          <span className="empty-icon">🔍</span>
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
                  ▾
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
                            ▾
                          </span>
                          <span>{MONTHS_AR[m]}</span>
                          <span className="archive-month-count">{monthCount}</span>
                        </button>

                        {!monthCollapsed && (
                          <div className="archive-month-body">
                            {days.map((d) => {
                              const dayLists = byDay.get(d)!;
                              const weekday = WEEKDAYS_AR[new Date(y, m, d).getDay()];
                              return (
                                <div className="archive-day-group" key={`${monthKey}-${d}`}>
                                  <div className="archive-day-header">
                                    <span className="archive-day-number">{d}</span>
                                    <span className="archive-day-weekday">{weekday}</span>
                                    <span className="archive-day-count">{dayLists.length} مهمة</span>
                                  </div>
                                  <div className="archive-cards">
                                    {dayLists.map((list) => {
                                      const cat = categoryOf(list.category);
                                      const pr = priorityOf(list.priority);
                                      const doneCount = list.items.filter((i) => i.isDone).length;
                                      return (
                                        <div className="archive-card" key={list.id}>
                                          <div className="archive-card-head">
                                            <h3>{list.title}</h3>
                                            <span className="archive-card-time" dir="ltr" title="وقت الأرشفة">
                                              {formatTime(list.archivedAt)}
                                            </span>
                                          </div>
                                          <div className="archive-card-badges">
                                            {cat && (
                                              <span
                                                className="category-badge archive-static-badge"
                                                style={{ color: cat.color, background: cat.bg }}
                                              >
                                                <span aria-hidden="true">{cat.icon}</span> {cat.short}
                                                {cat.key === 'YEARLY' && list.targetYear ? ` ${list.targetYear}` : ''}
                                              </span>
                                            )}
                                            {list.priority && list.priority !== 'NONE' && (
                                              <span
                                                className="priority-badge archive-static-badge"
                                                style={{ color: pr.color, background: pr.bg }}
                                              >
                                                {pr.short}
                                              </span>
                                            )}
                                            {list.lifeArea && (
                                              <span
                                                className="life-area-badge-chip archive-static-badge"
                                                style={{ color: list.lifeArea.color, background: hexToSoftBg(list.lifeArea.color) }}
                                              >
                                                {list.lifeArea.imageUrl ? (
                                                  <img
                                                    className="life-area-tab-img"
                                                    src={resolveLifeAreaImageUrl(list.lifeArea.imageUrl) ?? undefined}
                                                    alt=""
                                                  />
                                                ) : (
                                                  <span aria-hidden="true">{list.lifeArea.icon || '🏷️'}</span>
                                                )}{' '}
                                                {list.lifeArea.name}
                                              </span>
                                            )}
                                          </div>

                                          {list.items.length > 0 && (
                                            <ul className="archive-item-list">
                                              {list.items.map((it) => (
                                                <li key={it.id} className={it.isDone ? 'done' : ''}>
                                                  <span className={`checkbox ${it.isDone ? 'checked' : ''}`} aria-hidden="true">
                                                    <svg viewBox="0 0 16 16">
                                                      <polyline points="3,9 6.5,12.5 13,4" />
                                                    </svg>
                                                  </span>
                                                  <span>{it.content}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          )}

                                          <div className="archive-card-footer">
                                            <span className="archive-card-progress">
                                              {doneCount}/{list.items.length} منجزة
                                            </span>
                                            <div className="row-actions">
                                              <button
                                                className="small"
                                                type="button"
                                                onClick={() => setConfirmRestore(list)}
                                              >
                                                ↩ استرجاع
                                              </button>
                                              <button
                                                className="danger small"
                                                type="button"
                                                onClick={() => setConfirmDelete(list)}
                                              >
                                                حذف نهائي
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
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
              هترجع "<strong>{confirmRestore.title}</strong>" لقائمة مهامك النشطة تاني.
            </>
          }
          confirmLabel="استرجاع"
          danger={false}
          onCancel={() => setConfirmRestore(null)}
          onConfirm={() => handleRestore(confirmRestore)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="حذف المهمة نهائيًا؟"
          description={
            <>
              هيتم حذف "<strong>{confirmDelete.title}</strong>" وكل مهامها الفرعية ({confirmDelete.items.length}) من
              الأرشيف نهائيًا. الإجراء ده مينفعش يترجع.
            </>
          }
          confirmLabel="حذف نهائيًا"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </div>
  );
}
