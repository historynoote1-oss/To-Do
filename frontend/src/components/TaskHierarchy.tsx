// عرض هرمي جديد لمكان عرض المهام في الصفحة الرئيسية:
// مجال الحياة ← التصنيف ← الأولوية ← المهام، كل مستوى قابل للطي عن طريق
// <details> (بدون حاجة لـ state إضافي)، مع عدّاد وأيقونة لكل قسم عشان
// الوصول لأي مهمة يبقى سريع من غير تشتت، حتى لو الأعداد كبيرة.

import { HierarchicalLifeAreaGroup, NO_LIFE_AREA_GROUP, NO_CATEGORY_GROUP } from '../lib/organize';
import { DynamicIcon } from '../lib/icons';
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
  return (
    <div className="task-hierarchy">
      {groups.map((area) => (
        <details id={`section-area-${area.id}`} className="hier-area" key={area.id} open>
          <summary className="hier-area-summary" style={{ ['--chip-color' as any]: area.color }}>
            <DynamicIcon name="chevron-down" size={14} className="hier-caret" />
            {area.id !== NO_LIFE_AREA_GROUP && <span className="task-section-dot" style={{ background: area.color }} />}
            <DynamicIcon name={(area.icon as any) || 'tag'} size={16} />
            <span className="hier-label">{area.name}</span>
            <span className="task-section-count">{area.count}</span>
          </summary>

          <div className="hier-area-body">
            {area.categoryGroups.map((cat) => (
              <details className="hier-category" key={cat.key} open={area.categoryGroups.length <= 2}>
                <summary className="hier-category-summary">
                  <DynamicIcon name="chevron-down" size={12} className="hier-caret" />
                  <DynamicIcon name={cat.icon as any} size={14} style={{ color: cat.color }} />
                  <span className="hier-label">{cat.key === NO_CATEGORY_GROUP ? cat.label : cat.label}</span>
                  <span className="task-section-count">{cat.count}</span>
                </summary>

                <div className="hier-category-body">
                  {cat.priorityGroups.map((pr) => (
                    <details className="hier-priority" key={pr.key} open>
                      <summary className="hier-priority-summary">
                        <DynamicIcon name="chevron-down" size={11} className="hier-caret" />
                        <span className="hier-priority-dot" style={{ background: pr.color }} />
                        <span className="hier-label">{pr.label}</span>
                        <span className="task-section-count">{pr.lists.length}</span>
                      </summary>
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
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
