import { useMemo } from 'react';
import TodoList from '@/components/tasks/TodoList';
import { DynamicIcon, IconKey } from '@/lib/core/icons';
import { CATEGORIES } from '@/lib/core/category';
import { LifeAreaData } from '@/lib/core/lifeArea';

const UNCATEGORIZED = { key: 'NONE', label: 'غير مصنّفة', icon: 'tag' as IconKey, color: '#766a92' };

interface Props {
  lists: any[];
  onChange: () => void;
  onFinalize: (id: string) => void;
  onDeleteList: (id: string) => void;
  lifeAreas: LifeAreaData[];
  onManageLifeAreas: () => void;
}

// دايرة SVG صغيرة بتوضّح نسبة المهام المسترجعة اللي لسه فيها مهام فرعية
// غير منجزة — بديل مصغّر عن ProgressRing المستخدمة في CompletionRateCard،
// بس بلون مخصص لقسم "بانتظار المراجعة" عشان يتفرّق بصريًا عن باقي البطاقات.
function MiniReadinessRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--pending-restore)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 400ms ease' }}
      />
    </svg>
  );
}

export default function PendingRestoreSection({
  lists,
  onChange,
  onFinalize,
  onDeleteList,
  lifeAreas,
  onManageLifeAreas,
}: Props) {
  const { readyCount, totalDone, totalItems, categorySegments } = useMemo(() => {
    let ready = 0;
    let done = 0;
    let total = 0;
    const counts = new Map<string, number>();
    for (const l of lists) {
      const items = (l.items || []) as { isDone: boolean }[];
      const t = items.length;
      const d = items.filter((i) => i.isDone).length;
      total += t;
      done += d;
      if (t > 0 && d === t) ready += 1;
      const key = l.category || 'NONE';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const defs = [...CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: c.icon, color: c.color })), UNCATEGORIZED];
    const segments = defs
      .map((c) => ({ ...c, count: counts.get(c.key) || 0, pct: lists.length > 0 ? ((counts.get(c.key) || 0) / lists.length) * 100 : 0 }))
      .filter((s) => s.count > 0);
    return { readyCount: ready, totalDone: done, totalItems: total, categorySegments: segments };
  }, [lists]);

  if (lists.length === 0) return null;

  const overallPct = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

  return (
    <section className="pending-restore-section" aria-label="مهام مسترجعة من الأرشيف بانتظار المراجعة">
      <div className="pending-restore-header">
        <span className="pending-restore-header-icon">
          <DynamicIcon name="undo" size={20} />
        </span>
        <div className="pending-restore-header-text">
          <h3>
            مهام مسترجعة بانتظار المراجعة
            <span className="pending-restore-count-badge">{lists.length}</span>
          </h3>
          <p>راجعت المهام دي وعدّلتها لو محتاجة، وبعدين اضغط "إضافة المهمة" في أي منها عشان ترجع لقائمتك النشطة</p>
        </div>
      </div>

      <div className="pending-restore-stats">
        <div className="pending-restore-stat">
          <MiniReadinessRing pct={overallPct} />
          <div className="pending-restore-stat-text">
            <strong>{overallPct}%</strong>
            <span dir="ltr">
              {totalDone}/{totalItems} منجزة
            </span>
          </div>
        </div>

        <div className="pending-restore-stat pending-restore-stat-ready">
          <span className="pending-restore-stat-icon">
            <DynamicIcon name="check" size={16} />
          </span>
          <div className="pending-restore-stat-text">
            <strong>{readyCount}</strong>
            <span>جاهزة للإضافة فورًا</span>
          </div>
        </div>

        {categorySegments.length > 0 && (
          <div className="pending-restore-chart">
            <span className="pending-restore-chart-label">التوزيع حسب التصنيف</span>
            <div className="stat-block-minibar" aria-hidden="true">
              {categorySegments.map((s) => (
                <span key={s.key} style={{ width: `${s.pct}%`, background: s.color }} />
              ))}
            </div>
            <div className="pending-restore-chart-legend">
              {categorySegments.map((s) => (
                <span key={s.key} className="pending-restore-chart-legend-item" style={{ color: s.color }}>
                  <DynamicIcon name={s.icon as IconKey} size={11} />
                  {s.label} · {s.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="lists-grid pending-restore-grid">
        {lists.map((list, i) => (
          <TodoList
            key={`pending-${list.id}`}
            list={list}
            onChange={onChange}
            onDeleteList={onDeleteList}
            delay={i * 60}
            lifeAreas={lifeAreas}
            onManageLifeAreas={onManageLifeAreas}
            pendingRestore
            onFinalizeRestore={() => onFinalize(list.id)}
          />
        ))}
      </div>
    </section>
  );
}
