import { useEffect, useRef, useState } from 'react';
import { hexToSoftBg, hexToGradient, DEFAULT_LIFE_AREA_ICON } from '../lib/lifeArea';
import { resolveLifeAreaImageUrl } from '../lib/api';
import { sounds } from '../lib/sounds';
import { DynamicIcon } from '../lib/icons';

// شكل مبسّط لمجال الحياة يكفي لعرض الشارة/الأيقونة — بيقبل سواء الكائن
// الكامل (LifeAreaData مع الإحصائيات) أو النسخة المختصرة المرفقة مع كل
// مهمة رئيسية في رد /api/lists (بدون stats/position).
export interface LifeAreaLite {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  imageUrl: string | null;
  // parentId اختياري هنا (مش كل استدعاء قديم للمكوّن بيبعته) — لو موجود
  // بيُستخدم بس لبناء عرض هرمي (مسافة بادئة) في القوائم المنسدلة.
  parentId?: string | null;
}

// بترتب قائمة مسطّحة من المجالات بحيث كل أب يتبعه فروعه المباشرة (بعمق
// أي مستوى)، وبترجع مع كل واحد "عمقه" — عشان القوائم المنسدلة (الشارة/
// المنتقي) تقدر تعرض تعشيش بصري (مسافة بادئة) من غير ما تحتاج تفهم شكل
// شجرة كامل. لو مفيش parentId خالص في البيانات (نسخة قديمة)، بيرجع نفس
// الترتيب الأصلي وكل حاجة depth=0.
export function flattenAreasForMenu<T extends LifeAreaLite>(areas: T[]): (T & { depth: number })[] {
  const byParent = new Map<string | null, T[]>();
  for (const a of areas) {
    const key = a.parentId ?? null;
    const arr = byParent.get(key) || [];
    arr.push(a);
    byParent.set(key, arr);
  }
  const seen = new Set<string>();
  const out: (T & { depth: number })[] = [];
  function walk(list: T[], depth: number) {
    for (const a of list) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ ...a, depth });
      const kids = byParent.get(a.id);
      if (kids?.length) walk(kids, depth + 1);
    }
  }
  walk(byParent.get(null) || [], 0);
  // أي مجال parentId بتاعه بيشاور على حاجة مش موجودة في نفس القائمة
  // (نادر، بس ممكن يحصل مع بيانات جزئية) بيتحط في الآخر كجذري احتياطي.
  for (const a of areas) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      out.push({ ...a, depth: 0 });
    }
  }
  return out;
}

// الشارة الموحّدة لأيقونة/صورة مجال الحياة — نفس المكوّن ده هو اللي بيتحط
// جنب اسم المجال في كل مكان بالموقع (الشارة الرئيسية، القوائم المنسدلة،
// شرائح الفلاتر، الأرشيف...) عشان الشكل يفضل متسق 100%. لو المجال معاه
// صورة مرفوعة بتتعرض هي زي ما هي، ولو أيقونة بس بتتحط جوه "شارة" دائرية
// بتدرج لوني (gradient) متولّد تلقائيًا من لون المجال — ده اللي بيدّي
// الإحساس بألوان "حديثة ومتناسقة" من غير ما نضطر نخزّن أكتر من لون واحد.
export function AreaGlyph({ area, size = 'md' }: { area: LifeAreaLite | null | undefined; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 20 : 24;
  const iconPx = size === 'sm' ? 12 : 14;

  if (!area) {
    return (
      <span className="life-area-glyph-chip life-area-glyph-chip-empty" style={{ width: px, height: px }}>
        <DynamicIcon name={DEFAULT_LIFE_AREA_ICON} size={iconPx} className="life-area-glyph-chip-icon" />
      </span>
    );
  }
  if (area.imageUrl) {
    return (
      <img
        className={`life-area-glyph-img ${size}`}
        src={resolveLifeAreaImageUrl(area.imageUrl) ?? undefined}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span
      className="life-area-glyph-chip"
      style={{ width: px, height: px, background: hexToGradient(area.color) }}
    >
      <DynamicIcon name={area.icon || DEFAULT_LIFE_AREA_ICON} size={iconPx} className="life-area-glyph-chip-icon" />
    </span>
  );
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
            <ul className="category-menu-list life-area-menu-list">
              {flattenAreasForMenu(areas).map((a) => (
                <li key={a.id} style={{ ['--depth' as any]: a.depth }}>
                  <button
                    type="button"
                    className={`priority-menu-item category-menu-item life-area-menu-item ${a.id === value?.id ? 'selected' : ''} ${a.depth > 0 ? 'is-nested' : ''}`}
                    style={{ ['--pcolor' as any]: a.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      select(a.id);
                    }}
                    role="option"
                    aria-selected={a.id === value?.id}
                  >
                    {a.depth > 0 && <span className="life-area-menu-item-branch" aria-hidden="true" />}
                    <AreaGlyph area={a} size="sm" />
                    <span className="category-menu-item-text">
                      <span>{a.name}</span>
                    </span>
                    {a.id === value?.id && (
                      <span className="priority-check">
                        <DynamicIcon name="check" size={14} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
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
              <DynamicIcon name="settings" size={14} /> إدارة مجالات الحياة
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
// CategoryPicker، بس بيسرد مجالات المستخدم نفسه. زرار "إنشاء مجال جديد"
// ظاهر دايمًا (مش بس لما القائمة فاضية) عشان المستخدم يقدر يضيف مجال
// جديد من غير ما يسيب اللي هو بيعمله.
export function LifeAreaPicker({ value, areas, onChange, onManage }: PickerProps) {
  if (areas.length === 0) {
    return (
      <div className="life-area-picker-empty">
        <span>لسه معملتش أي مجال حياة</span>
        {onManage && (
          <button type="button" className="small" onClick={onManage}>
            <DynamicIcon name="plus" size={14} /> إنشاء أول مجال
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="life-area-picker-group">
      <div className="priority-picker category-picker life-area-picker" role="radiogroup" aria-label="اختيار مجال الحياة">
        {flattenAreasForMenu(areas).map((a) => (
          <button
            key={a.id}
            type="button"
            className={`priority-picker-item category-picker-item life-area-picker-item ${a.id === value ? 'selected' : ''} ${a.depth > 0 ? 'is-nested' : ''}`}
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
            <span>{a.depth > 0 ? `↳ ${a.name}` : a.name}</span>
          </button>
        ))}
      </div>
      {onManage && (
        <button type="button" className="life-area-create-new-btn" onClick={onManage}>
          <DynamicIcon name="plus" size={14} /> إنشاء مجال حياة جديد
        </button>
      )}
    </div>
  );
}
