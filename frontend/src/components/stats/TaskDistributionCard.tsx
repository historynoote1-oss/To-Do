import { useMemo, useState } from 'react';
import { CATEGORIES, CategoryKey } from '@/lib/core/category';
import { DynamicIcon, IconKey } from '@/lib/core/icons';
import { sounds } from '@/lib/audio/sounds';

// قسم "غير مصنّفة" مش موجود في CATEGORIES (لأنها بتاعة الاختيار عند
// الإنشاء بس)، فبنمثّله كشريحة إضافية عشان مجموع الشرائح يساوي إجمالي
// المهام دايمًا ومفيش عدد يضيع من الإحصائية.
const UNCATEGORIZED: { key: 'NONE'; label: string; icon: IconKey; color: string; bg: string } = {
  key: 'NONE',
  label: 'غير مصنّفة',
  icon: 'tag',
  color: '#766a92',
  bg: 'rgba(107, 114, 128, 0.14)',
};

interface MinimalList {
  category?: string | null;
}

interface Segment {
  key: string;
  label: string;
  icon: IconKey;
  color: string;
  bg: string;
  count: number;
  pct: number;
}

interface Props {
  lists: MinimalList[];
  onSelectCategory: (key: CategoryKey) => void;
}

export default function TaskDistributionCard({ lists, onSelectCategory }: Props) {
  const [expanded, setExpanded] = useState(false);
  const total = lists.length;

  const segments = useMemo<Segment[]>(() => {
    const counts = new Map<string, number>();
    for (const l of lists) {
      const key = l.category || 'NONE';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const defs = [...CATEGORIES, UNCATEGORIZED];
    return defs
      .map((c) => ({
        key: c.key,
        label: c.label,
        icon: c.icon as IconKey,
        color: c.color,
        bg: c.bg,
        count: counts.get(c.key) || 0,
        pct: total > 0 ? ((counts.get(c.key) || 0) / total) * 100 : 0,
      }))
      .filter((s) => s.count > 0);
  }, [lists, total]);

  function toggle() {
    if (total === 0) return;
    sounds.click();
    setExpanded((v) => !v);
  }

  function handleSelect(key: string) {
    if (key === 'NONE') return; // "غير مصنّفة" مش تصنيف حقيقي، مفيش فلتر ليها في نظام الفلترة
    sounds.click();
    onSelectCategory(key as CategoryKey);
  }

  return (
    <div className={`stat-block ${total === 0 ? 'disabled' : ''}`}>
      <div className="stat-block-head">
        <span className="stat-block-icon">
          <DynamicIcon name="clipboard-list" size={16} />
        </span>
        <div className="stat-block-main">
          <span className="stat-block-value">{total}</span>
          <span className="stat-block-label">إجمالي المهام الرئيسية الآن</span>
        </div>
      </div>

      <div className="stat-block-minibar" aria-hidden="true">
        {segments.length > 0 ? (
          segments.map((s) => (
            <span key={s.key} style={{ width: `${s.pct}%`, background: s.color }} />
          ))
        ) : (
          <span className="task-distribution-minibar-empty" />
        )}
      </div>

      {total > 0 && (
        <button type="button" className="stat-block-toggle" onClick={toggle} aria-expanded={expanded}>
          <DynamicIcon name="chevron-down" size={14} className={`stat-block-toggle-icon ${expanded ? 'flipped' : ''}`} />
          <span>{expanded ? 'إخفاء التفاصيل' : 'عرض التوزيع حسب القسم'}</span>
        </button>
      )}

      {expanded && total > 0 && (
        <div className="stat-block-panel">
          {segments.map((s) => (
            <button
              key={s.key}
              type="button"
              className="task-distribution-row"
              onClick={() => handleSelect(s.key)}
              disabled={s.key === 'NONE'}
              title={s.key === 'NONE' ? undefined : `فلترة على ${s.label}`}
            >
              <span className="task-distribution-row-icon" style={{ color: s.color, background: s.bg }}>
                <DynamicIcon name={s.icon} size={15} />
              </span>
              <span className="task-distribution-row-label">{s.label}</span>
              <span className="task-distribution-row-track" style={{ background: s.bg }}>
                <span
                  className="task-distribution-row-fill"
                  style={{ width: `${s.pct}%`, background: s.color, boxShadow: `0 0 8px -1px ${s.color}` }}
                />
              </span>
              <span className="task-distribution-row-count">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
