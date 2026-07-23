// عرض هرمي لمكان عرض المهام في الصفحة الرئيسية: مجال الحياة ← التصنيف ←
// الأولوية ← المهام. اتبنى بنفس شكل وتصميم شجرة الأرشيف بالظبط (سنة/شهر/يوم)
// عشان يبقى نفس الإحساس البصري في كل التطبيق: هيدر قابل للطي بسهم بيتلف،
// عداد لكل قسم، وأزرار "فتح الكل / قفل الكل" في الأعلى.

import { useEffect, useState } from 'react';
import { HierarchicalLifeAreaGroup } from '@/lib/core/organize';
import { DynamicIcon } from '@/lib/core/icons';
import { sounds } from '@/lib/audio/sounds';
import TodoList from '@/components/tasks/TodoList';
import { LifeAreaData } from '@/lib/core/lifeArea';

// بيشيل مفتاح من Set ويرجع نفس الـ Set (من غير نسخة جديدة) لو المفتاح مش
// موجود أصلًا — عشان مانعملش re-render وتشغيل useEffect من غير داعي.
function withoutKey(set: Set<string>, key: string): Set<string> {
  if (!set.has(key)) return set;
  const next = new Set(set);
  next.delete(key);
  return next;
}

export default function TaskHierarchy({
  groups,
  onChange,
  onDeleteList,
  lifeAreas,
  onManageLifeAreas,
  highlightedListId,
  onCreateSubGoal,
}: {
  groups: HierarchicalLifeAreaGroup<any>[];
  onChange: () => void;
  onDeleteList: (id: string) => void;
  lifeAreas: LifeAreaData[];
  onManageLifeAreas: () => void;
  highlightedListId?: string | null;
  // بيتنادى لما المستخدم يضيف "هدف فرعي" من كارت هدف موجود مباشرة — شوف
  // نفس الـ prop على TodoList.
  onCreateSubGoal?: (data: any) => Promise<void> | void;
}) {
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
  const [collapsedPriorities, setCollapsedPriorities] = useState<Set<string>>(new Set());

  // لو مهمة اتحددت كـ"مضيئة" (Highlighted) من بطاقات الإحصائيات فوق، لازم
  // نتأكد إن كل الأقسام اللي هي جواها (مجال الحياة/التصنيف/السنة/الأولوية)
  // مفتوحة فعلًا — قبل كده كان ممكن الضغط على "روح لأول مهمة متأخرة" مثلًا
  // ميعملش أي حاجة ظاهرة لو المهمة دي جوه قسم مطوي، لأن العنصر مايكونش
  // موجود في الـ DOM أصلًا (بنعرضه بشرط `{!collapsed && (...)}` مش بس بنخفيه
  // بالـ CSS)، فـ scrollIntoView كان بيلاقي العنصر مش موجود ومايعملش حاجة.
  useEffect(() => {
    if (!highlightedListId) return;
    for (const area of groups) {
      for (const cat of area.categoryGroups) {
        const catKey = `${area.id}-${cat.key}`;
        const yearGroups = cat.yearGroups && cat.yearGroups.length > 0 ? cat.yearGroups : null;
        const priorityBuckets = yearGroups
          ? yearGroups.map((yr) => ({ yearKey: `${catKey}-${yr.key}`, priorityGroups: yr.priorityGroups }))
          : [{ yearKey: null as string | null, priorityGroups: cat.priorityGroups }];

        for (const bucket of priorityBuckets) {
          for (const pr of bucket.priorityGroups) {
            if (!pr.lists.some((l: any) => l.id === highlightedListId)) continue;
            setCollapsedAreas((prev) => withoutKey(prev, area.id));
            setCollapsedCategories((prev) => withoutKey(prev, catKey));
            if (bucket.yearKey) setCollapsedYears((prev) => withoutKey(prev, bucket.yearKey!));
            setCollapsedPriorities((prev) => withoutKey(prev, `${bucket.yearKey ?? catKey}-${pr.key}`));
            return;
          }
        }
      }
    }
  }, [highlightedListId, groups]);

  // بعد ما القسم يتفتح (لو كان مطوي)، لازم نستنى الـ DOM يترسم فعليًا قبل
  // ما نعمل scroll — ده بيتكرر مع أي تغيير في حالة الطي عشان نضمن إن
  // scrollIntoView بيشتغل على العنصر بعد ما يبقى موجود، مش قبلها.
  useEffect(() => {
    if (!highlightedListId) return;
    const raf = requestAnimationFrame(() => {
      document.getElementById(`list-${highlightedListId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightedListId, collapsedAreas, collapsedCategories, collapsedYears, collapsedPriorities]);

  function toggleArea(id: string) {
    sounds.click();
    setCollapsedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(key: string) {
    sounds.click();
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleYear(key: string) {
    sounds.click();
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function togglePriority(key: string) {
    sounds.click();
    setCollapsedPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // بتفتح/تقفل المستويات التلاتة (مجال/تصنيف/أولوية) دفعة واحدة، بنفس
  // فكرة "فتح الكل / قفل الكل" الموجودة في الأرشيف بالظبط.
  function expandAll() {
    sounds.click();
    setCollapsedAreas(new Set());
    setCollapsedCategories(new Set());
    setCollapsedYears(new Set());
    setCollapsedPriorities(new Set());
  }

  function collapseAll() {
    sounds.click();
    const areas = new Set<string>();
    const cats = new Set<string>();
    const yrs = new Set<string>();
    const prs = new Set<string>();
    for (const area of groups) {
      areas.add(area.id);
      for (const cat of area.categoryGroups) {
        const catKey = `${area.id}-${cat.key}`;
        cats.add(catKey);
        if (cat.yearGroups && cat.yearGroups.length > 0) {
          for (const yr of cat.yearGroups) {
            const yearKey = `${catKey}-${yr.key}`;
            yrs.add(yearKey);
            for (const pr of yr.priorityGroups) {
              prs.add(`${yearKey}-${pr.key}`);
            }
          }
        } else {
          for (const pr of cat.priorityGroups) {
            prs.add(`${catKey}-${pr.key}`);
          }
        }
      }
    }
    setCollapsedAreas(areas);
    setCollapsedCategories(cats);
    setCollapsedYears(yrs);
    setCollapsedPriorities(prs);
  }

  // بيرسم مستوى الأولوية ← المهام، مستخدَم سواء تحت التصنيف مباشرة (باقي
  // التصنيفات) أو تحت كل سنة (تصنيف "سنوية") — نفس الشكل بالظبط في الحالتين.
  function renderPriorityGroups(priorityGroups: typeof groups[number]['categoryGroups'][number]['priorityGroups'], parentKey: string) {
    return priorityGroups.map((pr) => {
      const prKey = `${parentKey}-${pr.key}`;
      const prCollapsed = collapsedPriorities.has(prKey);
      return (
        <div className="hier-priority-group" key={prKey}>
          <button
            type="button"
            className="hier-priority-header"
            onClick={() => togglePriority(prKey)}
            style={{ ['--pr-color' as any]: pr.color }}
            aria-expanded={!prCollapsed}
          >
            <span className={`archive-collapse-caret ${prCollapsed ? 'collapsed' : ''}`} aria-hidden="true">
              <DynamicIcon name="chevron-down" size={13} />
            </span>
            <span className="hier-priority-dot" style={{ background: pr.color }} />
            <span>{pr.label}</span>
            <span className="archive-day-count">{pr.lists.length} مهمة</span>
          </button>

          {!prCollapsed && (
            <div className="archive-day-body">
              <div className="lists-grid hier-lists-grid">
                {pr.lists.map((list: any, i: number) => (
                  <div id={`list-${list.id}`} key={list.id}>
                    <TodoList
                      list={list}
                      onChange={onChange}
                      onDeleteList={onDeleteList}
                      delay={i * 40}
                      lifeAreas={lifeAreas}
                      onManageLifeAreas={onManageLifeAreas}
                      highlighted={highlightedListId === list.id}
                      onCreateSubGoal={onCreateSubGoal}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    });
  }

  if (groups.length === 0) return null;

  return (
    <div className="task-hierarchy">
      <div className="archive-expand-controls hier-expand-controls">
        <button type="button" className="small" onClick={expandAll}>
          <DynamicIcon name="chevrons-down" size={14} /> فتح الكل
        </button>
        <button type="button" className="small" onClick={collapseAll}>
          <DynamicIcon name="chevrons-up" size={14} /> قفل الكل
        </button>
      </div>

      {groups.map((area) => {
        const areaCollapsed = collapsedAreas.has(area.id);
        return (
          <div className="archive-year-group" id={`section-area-${area.id}`} key={area.id}>
            <button
              type="button"
              className="archive-year-header hier-area-header"
              onClick={() => toggleArea(area.id)}
              style={{ ['--chip-color' as any]: area.color }}
              aria-expanded={!areaCollapsed}
            >
              <span className={`archive-collapse-caret ${areaCollapsed ? 'collapsed' : ''}`} aria-hidden="true">
                <DynamicIcon name="chevron-down" size={15} />
              </span>
              <span className="hier-icon-chip" style={{ background: area.color || 'var(--surface-3)' }}>
                <DynamicIcon name={(area.icon as any) || 'tag'} size={14} />
              </span>
              <span className="archive-year-title hier-area-title">{area.name}</span>
              <span className="archive-year-count">{area.count} مهمة</span>
            </button>

            {!areaCollapsed && (
              <div className="archive-year-body">
                {area.categoryGroups.map((cat) => {
                  const catKey = `${area.id}-${cat.key}`;
                  const catCollapsed = collapsedCategories.has(catKey);
                  return (
                    <div className="archive-month-group" key={catKey}>
                      <button
                        type="button"
                        className="archive-month-header"
                        onClick={() => toggleCategory(catKey)}
                        aria-expanded={!catCollapsed}
                      >
                        <span className={`archive-collapse-caret ${catCollapsed ? 'collapsed' : ''}`} aria-hidden="true">
                          <DynamicIcon name="chevron-down" size={14} />
                        </span>
                        <span className="hier-icon-chip hier-icon-chip-sm" style={{ background: cat.color || 'var(--surface-3)' }}>
                          <DynamicIcon name={cat.icon as any} size={12} />
                        </span>
                        <span>{cat.label}</span>
                        <span className="archive-month-count">{cat.count}</span>
                      </button>

                      {!catCollapsed && (
                        <div className="archive-month-body">
                          {cat.yearGroups && cat.yearGroups.length > 0
                            ? // تصنيف "سنوية": مستوى إضافي بالسنة المستهدفة قبل الأولوية.
                              cat.yearGroups.map((yr) => {
                                const yearKey = `${catKey}-${yr.key}`;
                                const yearCollapsed = collapsedYears.has(yearKey);
                                return (
                                  <div className="archive-day-group hier-year-group" key={yearKey}>
                                    <button
                                      type="button"
                                      className="archive-day-header hier-year-header"
                                      onClick={() => toggleYear(yearKey)}
                                      aria-expanded={!yearCollapsed}
                                    >
                                      <span className={`archive-collapse-caret ${yearCollapsed ? 'collapsed' : ''}`} aria-hidden="true">
                                        <DynamicIcon name="chevron-down" size={13} />
                                      </span>
                                      <DynamicIcon name="calendar-range" size={14} />
                                      <span className="hier-year-title" dir="ltr">{yr.label}</span>
                                      <span className="archive-day-count">
                                        {yr.priorityGroups.reduce((sum, pr) => sum + pr.lists.length, 0)} مهمة
                                      </span>
                                    </button>

                                    {!yearCollapsed && (
                                      <div className="hier-year-body">{renderPriorityGroups(yr.priorityGroups, yearKey)}</div>
                                    )}
                                  </div>
                                );
                              })
                            : renderPriorityGroups(cat.priorityGroups, catKey)}
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
  );
}
