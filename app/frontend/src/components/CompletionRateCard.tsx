import { useMemo, useState } from 'react';
import { CATEGORIES, CategoryKey } from '../lib/category';
import { DynamicIcon, IconKey } from '../lib/icons';
import { sounds } from '../lib/sounds';

const UNCATEGORIZED_ICON: IconKey = 'tag';
const UNCATEGORIZED_LABEL = 'غير مصنّفة';
const UNCATEGORIZED_COLOR = '#6b7280';
const UNCATEGORIZED_BG = 'rgba(107, 114, 128, 0.14)';

interface MinimalItem {
  isDone: boolean;
}

interface MinimalList {
  category?: string | null;
  items: MinimalItem[];
}

interface CategoryRate {
  key: string;
  label: string;
  icon: IconKey;
  color: string;
  bg: string;
  done: number;
  total: number;
  rate: number; // 0-100
}

interface Props {
  lists: MinimalList[];
  onSelectCategory: (key: CategoryKey) => void;
}

// دايرة تقدّم SVG بسيطة — بديل احترافي عن الشريط المسطّح، وبتفرّق بصريًا
// بين البطاقة دي وبطاقة توزيع المهام (اللي بتستخدم شريط أفقي).
function ProgressRing({ pct, size = 36, color }: { pct: number; size?: number; color: string }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="completion-ring" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--surface-2)"
        strokeWidth={stroke}
      />
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
  );
}

export default function CompletionRateCard({ lists, onSelectCategory }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { overallDone, overallTotal, overallRate, rows } = useMemo(() => {
    const byCategory = new Map<string, { done: number; total: number }>();
    let done = 0;
    let total = 0;
    for (const l of lists) {
      const key = l.category || 'NONE';
      const d = l.items.filter((i) => i.isDone).length;
      const t = l.items.length;
      done += d;
      total += t;
      const prev = byCategory.get(key) || { done: 0, total: 0 };
      byCategory.set(key, { done: prev.done + d, total: prev.total + t });
    }

    const defs: { key: string; label: string; icon: IconKey; color: string; bg: string }[] = [
      ...CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: c.icon as IconKey, color: c.color, bg: c.bg })),
      { key: 'NONE', label: UNCATEGORIZED_LABEL, icon: UNCATEGORIZED_ICON, color: UNCATEGORIZED_COLOR, bg: UNCATEGORIZED_BG },
    ];

    const rows: CategoryRate[] = defs
      .map((c) => {
        const agg = byCategory.get(c.key) || { done: 0, total: 0 };
        return {
          ...c,
          done: agg.done,
          total: agg.total,
          rate: agg.total > 0 ? Math.round((agg.done / agg.total) * 100) : 0,
        };
      })
      .filter((r) => r.total > 0);

    return {
      overallDone: done,
      overallTotal: total,
      overallRate: total > 0 ? Math.round((done / total) * 100) : 0,
      rows,
    };
  }, [lists]);

  const hasData = overallTotal > 0;
  const ringColor = overallRate >= 70 ? 'var(--success)' : 'var(--accent)';

  function toggle() {
    if (!hasData) return;
    sounds.click();
    setExpanded((v) => !v);
  }

  function handleSelect(key: string) {
    if (key === 'NONE') return;
    sounds.click();
    onSelectCategory(key as CategoryKey);
  }

  return (
    <div className={`stat-block ${!hasData ? 'disabled' : ''}`}>
      <div className="stat-block-head">
        {hasData ? (
          <span className="completion-ring-wrap stat-block-icon stat-block-icon-ring">
            <ProgressRing pct={overallRate} color={ringColor} />
            <span className="completion-ring-value">{overallRate}%</span>
          </span>
        ) : (
          <span className="stat-block-icon">
            <DynamicIcon name="trending-up" size={16} />
          </span>
        )}
        <div className="stat-block-main">
          <span className="stat-block-value">{hasData ? `${overallRate}%` : '—'}</span>
          <span className="stat-block-label">
            نسبة الإنجاز الآن {hasData && <span dir="ltr">({overallDone}/{overallTotal})</span>}
          </span>
        </div>
      </div>

      {hasData && (
        <button type="button" className="stat-block-toggle" onClick={toggle} aria-expanded={expanded}>
          <DynamicIcon name="chevron-down" size={14} className={`stat-block-toggle-icon ${expanded ? 'flipped' : ''}`} />
          <span>{expanded ? 'إخفاء التفاصيل' : 'عرض نسبة الإنجاز حسب القسم'}</span>
        </button>
      )}

      {expanded && hasData && (
        <div className="stat-block-panel">
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              className="task-distribution-row"
              onClick={() => handleSelect(r.key)}
              disabled={r.key === 'NONE'}
              title={r.key === 'NONE' ? undefined : `فلترة على ${r.label}`}
            >
              <span className="task-distribution-row-icon" style={{ color: r.color, background: r.bg }}>
                <DynamicIcon name={r.icon} size={15} />
              </span>
              <span className="task-distribution-row-label">{r.label}</span>
              <span className="task-distribution-row-track" style={{ background: r.bg }}>
                <span
                  className="task-distribution-row-fill"
                  style={{ width: `${r.rate}%`, background: r.color, boxShadow: `0 0 8px -1px ${r.color}` }}
                />
              </span>
              <span className="task-distribution-row-count" dir="ltr">{r.rate}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
