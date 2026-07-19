import { useEffect, useRef, useState } from 'react';
import { PRIORITIES, PriorityKey, priorityOf } from '../lib/priority';
import { sounds } from '../lib/sounds';
import { DynamicIcon } from '../lib/icons';

// أيقونة "أعمدة متدرّجة" بتوصّف مستوى الأولوية بصريًا (0 لحد 4 أعمدة مضيئة)،
// أوضح من إيموجي وبتنسجم مع باقي أيقونات SVG في الموقع.
export function PriorityIcon({ level, color, size = 14 }: { level: number; color: string; size?: number }) {
  const heights = [5, 8, 11, 14];
  return (
    <svg width={size} height={size} viewBox="0 0 20 16" fill="none" className="priority-icon">
      {heights.map((h, i) => (
        <rect
          key={i}
          x={1 + i * 5}
          y={16 - h}
          width={3.4}
          height={h}
          rx={1}
          fill={i < level ? color : 'currentColor'}
          opacity={i < level ? 1 : 0.18}
        />
      ))}
    </svg>
  );
}

interface BadgeProps {
  value: string;
  onChange: (key: PriorityKey) => void | Promise<void>;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

// شارة قابلة للنقر بتفتح قائمة منسدلة صغيرة لاختيار الأولوية — بتتحط
// جوه بطاقة المهمة الرئيسية أو صف المهمة الفرعية.
export function PriorityBadge({ value, onChange, size = 'md', disabled }: BadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const def = priorityOf(value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className={`priority-badge-wrap ${size}`} ref={ref}>
      <button
        type="button"
        className={`priority-badge ${def.key === 'CRITICAL' ? 'critical-pulse' : ''}`}
        style={{ color: def.color, background: def.bg, ['--glow' as any]: def.glow }}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          sounds.hover();
          setOpen((o) => !o);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <PriorityIcon level={def.level} color={def.color} size={size === 'sm' ? 12 : 14} />
        <span>{def.short}</span>
      </button>

      {open && (
        <ul className="priority-menu" role="listbox">
          {PRIORITIES.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                className={`priority-menu-item ${p.key === def.key ? 'selected' : ''}`}
                style={{ ['--pcolor' as any]: p.color }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (p.key !== def.key) {
                    sounds.priorityChange(p.level);
                    onChange(p.key);
                  }
                }}
                role="option"
                aria-selected={p.key === def.key}
              >
                <PriorityIcon level={p.level} color={p.color} size={13} />
                <span>{p.label}</span>
                {p.key === def.key && (
                  <span className="priority-check">
                    <DynamicIcon name="check" size={14} />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// شريط اختيار مضغوط للأولوية بيُستخدم عند إنشاء مهمة رئيسية أو فرعية جديدة،
// قبل ما يكون في عنصر فعلي نقدر نحط عليه شارة قابلة للنقر.
export function PriorityPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: PriorityKey) => void;
}) {
  return (
    <div className="priority-picker" role="radiogroup" aria-label="اختيار الأولوية">
      {PRIORITIES.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`priority-picker-item ${p.key === value ? 'selected' : ''}`}
          style={{ ['--pcolor' as any]: p.color, ['--pbg' as any]: p.bg }}
          onClick={() => {
            if (p.key !== value) {
              sounds.hover();
              onChange(p.key);
            }
          }}
          title={p.label}
          role="radio"
          aria-checked={p.key === value}
        >
          <PriorityIcon level={p.level} color={p.color} size={13} />
          <span>{p.short}</span>
        </button>
      ))}
    </div>
  );
}
