import { useEffect, useRef, useState } from 'react';
import { hexToSoftBg, DEFAULT_LIFE_AREA_ICON } from '../lib/lifeArea';
import { resolveLifeAreaImageUrl } from '../lib/api';
import { sounds } from '../lib/sounds';

// شكل مبسّط لمجال الحياة يكفي لعرض الشارة/الأيقونة — بيقبل سواء الكائن
// الكامل (LifeAreaData مع الإحصائيات) أو النسخة المختصرة المرفقة مع كل
// مهمة رئيسية في رد /api/lists (بدون stats/position).
export interface LifeAreaLite {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  imageUrl: string | null;
}

function AreaGlyph({ area, size = 'md' }: { area: LifeAreaLite | null | undefined; size?: 'sm' | 'md' }) {
  if (!area) return <span aria-hidden="true">🏷️</span>;
  if (area.imageUrl) {
    return (
      <img
        className={`life-area-glyph-img ${size}`}
        src={resolveLifeAreaImageUrl(area.imageUrl) ?? undefined}
        alt=""
      />
    );
  }
  return <span aria-hidden="true">{area.icon || DEFAULT_LIFE_AREA_ICON}</span>;
}

interface BadgeProps {
  value?: LifeAreaLite | null;
  areas: LifeAreaLite[];
  onChange: (areaId: string | null) => void | Promise<void>;
  onManage?: () => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

// شارة قابلة للنقر لإسناد المهمة الرئيسية لمجال حياة — نفس فلسفة
// CategoryBadge/PriorityBadge بالظبط، بس القائمة هنا ديناميكية (مجالات
// المستخدم نفسه) بدل قيم ثابتة، ومعاها رابط سريع لفتح إدارة المجالات.
export function LifeAreaBadge({ value, areas, onChange, onManage, size = 'md', disabled }: BadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  function select(id: string | null) {
    sounds.hover();
    setOpen(false);
    if (id !== (value?.id ?? null)) onChange(id);
  }

  return (
    <div className={`priority-badge-wrap category-badge-wrap life-area-badge-wrap ${size}`} ref={ref}>
      <button
        type="button"
        className="priority-badge category-badge life-area-badge"
        style={{ color: value ? value.color : 'var(--text-faint)', background: value ? hexToSoftBg(value.color) : 'var(--surface-2)' }}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          sounds.hover();
          setOpen((o) => !o);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value ? value.name : 'تحديد مجال الحياة'}
      >
        <AreaGlyph area={value} size={size} />
        <span>{value ? value.name : 'مجال الحياة'}</span>
      </button>

      {open && (
        <div className="priority-menu category-menu life-area-menu" role="listbox">
          {areas.length === 0 ? (
            <div className="life-area-menu-empty">
              مفيش مجالات لسه.
              {onManage && (
                <button
                  type="button"
                  className="small"
                  onClick={() => {
                    setOpen(false);
                    onManage();
                  }}
                >
                  إنشاء مجال جديد
                </button>
              )}
            </div>
          ) : (
            <ul className="category-menu-list">
              {areas.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`priority-menu-item category-menu-item ${a.id === value?.id ? 'selected' : ''}`}
                    style={{ ['--pcolor' as any]: a.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      select(a.id);
                    }}
                    role="option"
                    aria-selected={a.id === value?.id}
                  >
                    <AreaGlyph area={a} size="sm" />
                    <span className="category-menu-item-text">
                      <span>{a.name}</span>
                    </span>
                    {a.id === value?.id && <span className="priority-check">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {value && (
            <button type="button" className="category-clear-btn" onClick={() => select(null)}>
              ✕ إلغاء المجال
            </button>
          )}
          {onManage && (
            <button
              type="button"
              className="life-area-manage-link"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              ⚙️ إدارة مجالات الحياة
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface PickerProps {
  value: string | null;
  areas: LifeAreaLite[];
  onChange: (areaId: string | null) => void;
  onManage?: () => void;
}

// شريط اختيار مضغوط بيُستخدم عند إنشاء مهمة رئيسية جديدة — نفس فلسفة
// CategoryPicker، بس بيسرد مجالات المستخدم نفسه.
export function LifeAreaPicker({ value, areas, onChange, onManage }: PickerProps) {
  if (areas.length === 0) {
    return (
      <div className="life-area-picker-empty">
        <span>لسه معملتش أي مجال حياة</span>
        {onManage && (
          <button type="button" className="small" onClick={onManage}>
            + إنشاء أول مجال
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="priority-picker category-picker life-area-picker" role="radiogroup" aria-label="اختيار مجال الحياة">
      <button
        type="button"
        className={`priority-picker-item category-picker-item ${!value ? 'selected' : ''}`}
        onClick={() => {
          if (value) {
            sounds.hover();
            onChange(null);
          }
        }}
        title="بدون مجال"
        role="radio"
        aria-checked={!value}
      >
        <span>بدون مجال</span>
      </button>
      {areas.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`priority-picker-item category-picker-item ${a.id === value ? 'selected' : ''}`}
          style={{ ['--pcolor' as any]: a.color, ['--pbg' as any]: hexToSoftBg(a.color) }}
          onClick={() => {
            if (a.id !== value) {
              sounds.hover();
              onChange(a.id);
            }
          }}
          title={a.name}
          role="radio"
          aria-checked={a.id === value}
        >
          <AreaGlyph area={a} size="sm" />
          <span>{a.name}</span>
        </button>
      ))}
    </div>
  );
}
