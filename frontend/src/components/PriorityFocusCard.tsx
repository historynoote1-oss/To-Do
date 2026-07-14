import { useMemo, useState } from 'react';
import { PRIORITIES, PriorityKey } from '../lib/priority';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';

interface MinimalList {
  priority?: string | null;
  items: { isDone: boolean }[];
}

interface Row {
  key: PriorityKey;
  label: string;
  icon: 'flame' | 'zap' | 'target' | 'feather';
  color: string;
  bg: string;
  count: number;
  pct: number;
}

const ICON_BY_PRIORITY: Record<string, Row['icon']> = {
  CRITICAL: 'flame',
  HIGH: 'zap',
  MEDIUM: 'target',
  LOW: 'feather',
};

// بطاقة "تركيز الأولويات" — بتحل محل بطاقة "في الأرشيف" اللي كانت مكررة مع
// قسم الأرشيف نفسه. الفايدة هنا مختلفة تمامًا: بتجاوب على سؤال "فين المهام
// اللي محتاجة انتباهي دلوقتي؟" بعرض عدد المهام الرئيسية النشطة (غير
// المكتملة بالكامل) حسب مستوى الأولوية، مع تمييز واضح للحرجة/المرتفعة.
function isListDone(l: MinimalList): boolean {
  return l.items.length > 0 && l.items.every((i) => i.isDone);
}

interface Props {
  lists: MinimalList[];
  onSelectPriority: (key: PriorityKey) => void;
}

export default function PriorityFocusCard({ lists, onSelectPriority }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { rows, urgentCount, activeTotal } = useMemo(() => {
    const active = lists.filter((l) => !isListDone(l));
    const counts = new Map<string, number>();
    for (const l of active) {
      const key = (l.priority as PriorityKey) || 'LOW';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const total = active.length;
    const rows: Row[] = [...PRIORITIES]
      .sort((a, b) => b.level - a.level)
      .map((p) => ({
        key: p.key,
        label: p.label,
        icon: ICON_BY_PRIORITY[p.key] || 'target',
        color: p.color,
        bg: p.bg,
        count: counts.get(p.key) || 0,
        pct: total > 0 ? ((counts.get(p.key) || 0) / total) * 100 : 0,
      }))
      .filter((r) => r.count > 0);

    return {
      rows,
      urgentCount: (counts.get('CRITICAL') || 0) + (counts.get('HIGH') || 0),
      activeTotal: total,
    };
  }, [lists]);

  const hasData = activeTotal > 0;

  function toggle() {
    if (!hasData) return;
    sounds.click();
    setExpanded((v) => !v);
  }

  function handleSelect(key: PriorityKey) {
    sounds.click();
    onSelectPriority(key);
  }

  return (
    <div className={`stat-block ${!hasData ? 'disabled' : ''}`}>
      <div className="stat-block-head">
        <span
          className="stat-block-icon"
          style={{ color: urgentCount > 0 ? '#c13327' : 'var(--text-muted)', background: urgentCount > 0 ? 'rgba(193,51,39,0.12)' : 'var(--surface-2)' }}
        >
          <DynamicIcon name="flame" size={16} />
        </span>
        <div className="stat-block-main">
          <span className={`stat-block-value ${urgentCount > 0 ? 'stat-block-value-urgent' : ''}`}>{urgentCount}</span>
          <span className="stat-block-label">مهام عاجلة (حرجة ومرتفعة) الآن</span>
        </div>
      </div>

      {hasData && (
        <div className="stat-block-minibar" aria-hidden="true">
          {rows.map((r) => (
            <span key={r.key} style={{ width: `${r.pct}%`, background: r.color }} />
          ))}
        </div>
      )}

      {hasData && (
        <button
          type="button"
          className="stat-block-toggle"
          onClick={toggle}
          aria-expanded={expanded}
        >
          <DynamicIcon name="chevron-down" size={14} className={`stat-block-toggle-icon ${expanded ? 'flipped' : ''}`} />
          <span>{expanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل حسب الأولوية'}</span>
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
              title={`اذهب لأول مهمة بأولوية ${r.label}`}
            >
              <span className="task-distribution-row-icon" style={{ color: r.color, background: r.bg }}>
                <DynamicIcon name={r.icon} size={15} />
              </span>
              <span className="task-distribution-row-label">{r.label}</span>
              <span className="task-distribution-row-track" style={{ background: r.bg }}>
                <span
                  className="task-distribution-row-fill"
                  style={{ width: `${r.pct}%`, background: r.color, boxShadow: `0 0 8px -1px ${r.color}` }}
                />
              </span>
              <span className="task-distribution-row-count">{r.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
