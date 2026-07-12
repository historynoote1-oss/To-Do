import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, CategoryKey, categoryOf } from '../lib/category';
import { sounds } from '../lib/sounds';

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = CURRENT_YEAR - 5;
const MAX_YEAR = CURRENT_YEAR + 30;

function clampYear(y: number) {
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, y));
}

interface BadgeProps {
  value?: string | null;
  targetYear?: number | null;
  onChange: (key: CategoryKey | null, targetYear?: number | null) => void | Promise<void>;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

// شارة قابلة للنقر بتفتح قائمة منسدلة لاختيار تصنيف المهمة الرئيسية —
// نفس فلسفة PriorityBadge بالظبط (وبتستخدم نفس تصميم priority-badge/menu
// عشان تفضل متسقة بصريًا)، بس مع دعم إضافي لاختيار "سنة مستهدفة" لما
// التصنيف يكون سنوية.
export function CategoryBadge({ value, targetYear, onChange, size = 'md', disabled }: BadgeProps) {
  const [open, setOpen] = useState(false);
  const [showYearStep, setShowYearStep] = useState(false);
  const [yearDraft, setYearDraft] = useState(() => clampYear(targetYear || CURRENT_YEAR));
  const ref = useRef<HTMLDivElement>(null);
  const def = categoryOf(value);

  useEffect(() => {
    if (!open) return;
    setShowYearStep(value === 'YEARLY');
    setYearDraft(clampYear(targetYear || CURRENT_YEAR));
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
  }, [open, value, targetYear]);

  function selectCategory(key: CategoryKey) {
    if (key === 'YEARLY') {
      // التصنيف السنوي محتاج سنة مستهدفة، فبدل ما نقفل القائمة فورًا بنفتح
      // خطوة اختيار السنة جوه نفس القائمة، ومنبعتش onChange غير بعد التأكيد.
      sounds.hover();
      setShowYearStep(true);
      return;
    }
    sounds.hover();
    setOpen(false);
    if (key !== def?.key) onChange(key);
  }

  function confirmYear() {
    sounds.click();
    setOpen(false);
    onChange('YEARLY', yearDraft);
  }

  function clearCategory() {
    sounds.hover();
    setOpen(false);
    if (def) onChange(null);
  }

  return (
    <div className={`priority-badge-wrap category-badge-wrap ${size}`} ref={ref}>
      <button
        type="button"
        className="priority-badge category-badge"
        style={{ color: def?.color || 'var(--text-faint)', background: def?.bg || 'var(--surface-2)' }}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          sounds.hover();
          setOpen((o) => !o);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={def ? def.hint : 'تحديد تصنيف المهمة'}
      >
        <span aria-hidden="true">{def ? def.icon : '🏷️'}</span>
        <span>{def ? def.short : 'تصنيف'}</span>
      </button>

      {open && (
        <div className="priority-menu category-menu" role="listbox">
          <ul className="category-menu-list">
            {CATEGORIES.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  className={`priority-menu-item category-menu-item ${c.key === def?.key ? 'selected' : ''}`}
                  style={{ ['--pcolor' as any]: c.color }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectCategory(c.key);
                  }}
                  role="option"
                  aria-selected={c.key === def?.key}
                >
                  <span aria-hidden="true">{c.icon}</span>
                  <span className="category-menu-item-text">
                    <span>{c.label}</span>
                    <span className="category-menu-item-hint">{c.hint}</span>
                  </span>
                  {c.key === def?.key && <span className="priority-check">✓</span>}
                </button>
              </li>
            ))}
          </ul>

          {showYearStep && (
            <div className="category-year-stepper" onClick={(e) => e.stopPropagation()}>
              <span className="category-year-label">🏆 السنة المستهدفة</span>
              <div className="category-year-controls">
                <button
                  type="button"
                  onClick={() => setYearDraft((y) => clampYear(y - 1))}
                  disabled={yearDraft <= MIN_YEAR}
                  aria-label="سنة أقل"
                >
                  −
                </button>
                <span className="category-year-value" dir="ltr">
                  {yearDraft}
                </span>
                <button
                  type="button"
                  onClick={() => setYearDraft((y) => clampYear(y + 1))}
                  disabled={yearDraft >= MAX_YEAR}
                  aria-label="سنة أكتر"
                >
                  +
                </button>
              </div>
              <button type="button" className="small category-year-confirm" onClick={confirmYear}>
                تأكيد سنة {yearDraft}
              </button>
            </div>
          )}

          {def && (
            <button type="button" className="category-clear-btn" onClick={clearCategory}>
              ✕ إلغاء التصنيف
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface PickerProps {
  value: CategoryKey | null;
  targetYear?: number | null;
  onChange: (key: CategoryKey | null, targetYear?: number | null) => void;
}

// شريط اختيار مضغوط بيُستخدم عند إنشاء مهمة رئيسية جديدة، مع خطوة سنة
// مستهدفة بتظهر تلقائيًا تحته لو المستخدم اختار "سنوية".
export function CategoryPicker({ value, targetYear, onChange }: PickerProps) {
  const year = clampYear(targetYear || CURRENT_YEAR);
  return (
    <div className="category-picker-wrap">
      <div className="priority-picker category-picker" role="radiogroup" aria-label="اختيار تصنيف المهمة">
        <button
          type="button"
          className={`priority-picker-item category-picker-item ${!value ? 'selected' : ''}`}
          onClick={() => {
            if (value) {
              sounds.hover();
              onChange(null);
            }
          }}
          title="بدون تصنيف"
          role="radio"
          aria-checked={!value}
        >
          <span>بدون تصنيف</span>
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`priority-picker-item category-picker-item ${c.key === value ? 'selected' : ''}`}
            style={{ ['--pcolor' as any]: c.color, ['--pbg' as any]: c.bg }}
            onClick={() => {
              if (c.key !== value) {
                sounds.hover();
                onChange(c.key, c.key === 'YEARLY' ? year : undefined);
              }
            }}
            title={c.hint}
            role="radio"
            aria-checked={c.key === value}
          >
            <span aria-hidden="true">{c.icon}</span>
            <span>{c.short}</span>
          </button>
        ))}
      </div>

      {value === 'YEARLY' && (
        <div className="category-year-stepper category-year-stepper-inline">
          <span className="category-year-label">🏆 السنة المستهدفة</span>
          <div className="category-year-controls">
            <button
              type="button"
              onClick={() => onChange('YEARLY', clampYear(year - 1))}
              disabled={year <= MIN_YEAR}
              aria-label="سنة أقل"
            >
              −
            </button>
            <span className="category-year-value" dir="ltr">
              {year}
            </span>
            <button
              type="button"
              onClick={() => onChange('YEARLY', clampYear(year + 1))}
              disabled={year >= MAX_YEAR}
              aria-label="سنة أكتر"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
