// عرض هرمي لمكان عرض المهام في الصفحة الرئيسية: مجال الحياة ← التصنيف ←
// الأولوية ← المهام. اتبنى بنفس شكل وتصميم شجرة الأرشيف بالظبط (سنة/شهر/يوم)
// عشان يبقى نفس الإحساس البصري في كل التطبيق: هيدر قابل للطي بسهم بيتلف،
// عداد لكل قسم، وأزرار "فتح الكل / قفل الكل" في الأعلى.

import { useState } from 'react';
import { HierarchicalLifeAreaGroup, NO_LIFE_AREA_GROUP } from '../lib/organize';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';
import TodoList from './TodoList';
import { LifeAreaData } from '../lib/lifeArea';

export default function TaskHierarchy({
  groups,
  onChange,
  onDeleteList,
  lifeAreas,
  onManageLifeAreas,
  highlightedListId,
}: {
  groups: HierarchicalLifeAreaGroup<any>[];
  onChange: () => void;
  onDeleteList: (id: string) => void;
  lifeAreas: LifeAreaData[];
  onManageLifeAreas: () => void;
  highlightedListId?: string | null;
}) {
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedPriorities, setCollapsedPriorities] = useState<Set<string>>(new Set());

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
    setCollapsedPriorities(new Set());
  }

  function collapseAll() {
    sounds.click();
    const areas = new Set<string>();
    const cats = new Set<string>();
    const prs = new Set<string>();
    for (const area of groups) {
      areas.add(area.id);
      for (const cat of area.categoryGroups) {
        const catKey = `${area.id}-${cat.key}`;
        cats.add(catKey);
        for (const pr of cat.priorityGroups) {
          prs.add(`${catKey}-${pr.key}`);
        }
      }
    }
    setCollapsedAreas(areas);
    setCollapsedCategories(cats);
    setCollapsedPriorities(prs);
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
                ▾
              </span>
              {area.id !== NO_LIFE_AREA_GROUP && <span className="task-section-dot" style={{ background: area.color }} />}
              <DynamicIcon name={(area.icon as any) || 'tag'} size={16} />
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
                          ▾
                        </span>
                        <DynamicIcon name={cat.icon as any} size={14} style={{ color: cat.color }} />
                        <span>{cat.label}</span>
                        <span className="archive-month-count">{cat.count}</span>
                      </button>

                      {!catCollapsed && (
                        <div className="archive-month-body">
                          {cat.priorityGroups.map((pr) => {
                            const prKey = `${catKey}-${pr.key}`;
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
                                    ▾
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
                                          />
                                        </div>
                                      ))}
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
    </div>
  );
}
